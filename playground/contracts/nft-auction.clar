(use-trait nft-trait .sip-009-nft-trait.nft-trait)

(define-constant ONE_8 u100000000)

(define-constant ERR_NOT_OWNER (err u100))
(define-constant ERR_AUCTION_NOT_ACTIVE (err u101))
(define-constant ERR_BID_TOO_LOW (err u102))
(define-constant ERR_AUCTION_EXPIRED (err u103))
(define-constant ERR_AUCTION_NOT_ENDED (err u104))
(define-constant ERR_NO_BIDS (err u105))
(define-constant ERR_UNAUTHORIZED (err u106))
(define-constant ERR_INVALID_PERCENT (err u107))
(define-constant ERR_INVALID_DURATION (err u108))
(define-constant ERR_TRANSFER_FAILED (err u109))

(define-data-var auction-nonce uint u0)

(define-map auctions
    uint
    {
        nft-contract: principal,
        token-id: uint,
        seller: principal,
        reserve-price: uint,
        current-bid: uint,
        highest-bidder: (optional principal),
        end-block: uint,
        extension-blocks: uint,
        royalty-percent: uint,
        royalty-recipient: principal,
        active: bool,
    }
)

;; Track each bidder's escrowed amount per auction
(define-map escrow
    {
        auction-id: uint,
        bidder: principal,
    }
    uint
)

;; CREATE AUCTION
(define-public (create-auction
        (nft-contract <nft-trait>)
        (token-id uint)
        (duration-blocks uint)
        (reserve-price uint)
        (royalty-percent uint)
        (royalty-recipient principal)
    )
    (let (
            (auction-id (var-get auction-nonce))
            (end-block (+ stacks-block-height duration-blocks))
        )
        ;; Validate duration (min ~10 min, roughly 100 blocks)
        (asserts! (> duration-blocks u100) ERR_INVALID_DURATION)
        ;; Royalty max 10% (1000 basis points)
        (asserts! (<= royalty-percent u1000) ERR_INVALID_PERCENT)
        ;; Reserve price must be positive
        (asserts! (> reserve-price u0) ERR_BID_TOO_LOW)

        ;; Transfer NFT to contract for escrow
        (try! (contract-call? nft-contract transfer token-id tx-sender
            (as-contract tx-sender)
        ))

        (map-set auctions auction-id {
            nft-contract: (contract-of nft-contract),
            token-id: token-id,
            seller: tx-sender,
            reserve-price: reserve-price,
            current-bid: u0,
            highest-bidder: none,
            end-block: end-block,
            extension-blocks: u10,
            royalty-percent: royalty-percent,
            royalty-recipient: royalty-recipient,
            active: true,
        })

        (var-set auction-nonce (+ auction-id u1))

        (print {
            event: "auction-created",
            auction-id: auction-id,
            token-id: token-id,
            seller: tx-sender,
            reserve-price: reserve-price,
            end-block: end-block,
        })
        (ok auction-id)
    )
)

;; PLACE BID
(define-public (bid
        (auction-id uint)
        (amount uint)
    )
    (let (
            (auction (unwrap! (map-get? auctions auction-id) ERR_AUCTION_NOT_ACTIVE))
            (current-bid (get current-bid auction))
            (previous-highest-bidder (get highest-bidder auction))
            (min-increment (if (> (/ (* current-bid u5) u100) u10000)
                (/ (* current-bid u5) u100)
                u10000
            ))
            (min-bid (if (is-eq current-bid u0)
                (get reserve-price auction)
                (+ current-bid min-increment)
            ))
        )
        ;; Validations
        (asserts! (get active auction) ERR_AUCTION_NOT_ACTIVE)
        (asserts! (< stacks-block-height (get end-block auction)) ERR_AUCTION_EXPIRED)
        (asserts! (>= amount min-bid) ERR_BID_TOO_LOW)
        (asserts! (not (is-eq tx-sender (get seller auction))) ERR_UNAUTHORIZED)

        ;; Refund the previous highest bidder
        (match previous-highest-bidder
            prev-bidder (let ((prev-escrow (default-to u0
                    (map-get? escrow {
                        auction-id: auction-id,
                        bidder: prev-bidder,
                    })
                )))
                (if (> prev-escrow u0)
                    (begin
                        (try! (as-contract (stx-transfer? prev-escrow tx-sender prev-bidder)))
                        (map-delete escrow {
                            auction-id: auction-id,
                            bidder: prev-bidder,
                        })
                        true
                    )
                    true
                )
            )
            true
        )

        ;; Transfer new bid to contract
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))

        ;; Calculate new end block (extend if bid is in final extension window)
        (let (
                (blocks-remaining (- (get end-block auction) stacks-block-height))
                (new-end-block (if (< blocks-remaining (get extension-blocks auction))
                    (+ stacks-block-height (get extension-blocks auction))
                    (get end-block auction)
                ))
            )
            ;; Update auction with all changes in single map-set
            (map-set auctions auction-id
                (merge auction {
                    current-bid: amount,
                    highest-bidder: (some tx-sender),
                    end-block: new-end-block,
                })
            )
        )

        ;; Record escrow for new highest bidder
        (map-set escrow {
            auction-id: auction-id,
            bidder: tx-sender,
        }
            amount
        )

        (print {
            event: "bid",
            auction-id: auction-id,
            bidder: tx-sender,
            amount: amount,
        })
        (ok true)
    )
)

;; END AUCTION & DISTRIBUTE
;; Note: Must pass the same NFT contract trait that was used to create the auction
(define-public (end-auction
        (auction-id uint)
        (nft-contract <nft-trait>)
    )
    (let (
            (auction (unwrap! (map-get? auctions auction-id) ERR_AUCTION_NOT_ACTIVE))
            (token-id (get token-id auction))
            (winner (get highest-bidder auction))
            (final-bid (get current-bid auction))
            (royalty-percent (get royalty-percent auction))
            (royalty-recipient (get royalty-recipient auction))
            (seller (get seller auction))
            (royalty-amount (if (> royalty-percent u0)
                (/ (* final-bid royalty-percent) u10000)
                u0
            ))
            (seller-amount (- final-bid royalty-amount))
        )
        ;; Validations
        (asserts! (>= stacks-block-height (get end-block auction)) ERR_AUCTION_NOT_ENDED)
        (asserts! (get active auction) ERR_AUCTION_NOT_ACTIVE)
        ;; Verify the passed NFT contract matches the stored one
        (asserts! (is-eq (contract-of nft-contract) (get nft-contract auction))
            ERR_UNAUTHORIZED
        )

        ;; Deactivate auction first (reentrancy protection)
        (map-set auctions auction-id (merge auction { active: false }))

        ;; Distribute NFT & funds based on whether there was a winner
        (match winner
            winning-bidder
            (begin
                ;; Transfer NFT to winner
                (try! (as-contract (contract-call? nft-contract transfer token-id tx-sender
                    winning-bidder
                )))

                ;; Pay royalty if applicable
                (if (> royalty-amount u0)
                    (try! (as-contract (stx-transfer? royalty-amount tx-sender royalty-recipient)))
                    true
                )

                ;; Pay seller
                (try! (as-contract (stx-transfer? seller-amount tx-sender seller)))

                ;; Clear winner's escrow record
                (map-delete escrow {
                    auction-id: auction-id,
                    bidder: winning-bidder,
                })
                true
            )
            ;; No winner - return NFT to seller
            (begin
                (try! (as-contract (contract-call? nft-contract transfer token-id tx-sender seller)))
                true
            )
        )

        (print {
            event: "auction-ended",
            auction-id: auction-id,
            winner: winner,
            final-bid: final-bid,
            royalty: royalty-amount,
            seller-proceeds: seller-amount,
        })

        (ok true)
    )
)

;; CANCEL AUCTION (only if no bids yet)
(define-public (cancel-auction
        (auction-id uint)
        (nft-contract <nft-trait>)
    )
    (let (
            (auction (unwrap! (map-get? auctions auction-id) ERR_AUCTION_NOT_ACTIVE))
            (token-id (get token-id auction))
        )
        ;; Only seller can cancel
        (asserts! (is-eq tx-sender (get seller auction)) ERR_UNAUTHORIZED)
        ;; Must be active
        (asserts! (get active auction) ERR_AUCTION_NOT_ACTIVE)
        ;; Can only cancel if no bids
        (asserts! (is-none (get highest-bidder auction)) ERR_NO_BIDS)
        ;; Verify NFT contract matches
        (asserts! (is-eq (contract-of nft-contract) (get nft-contract auction))
            ERR_UNAUTHORIZED
        )

        ;; Deactivate auction
        (map-set auctions auction-id (merge auction { active: false }))

        ;; Return NFT to seller
        (try! (as-contract (contract-call? nft-contract transfer token-id tx-sender
            (get seller auction)
        )))

        (print {
            event: "auction-cancelled",
            auction-id: auction-id,
        })

        (ok true)
    )
)

;; READ-ONLY FUNCTIONS

(define-read-only (get-auction (id uint))
    (map-get? auctions id)
)

(define-read-only (get-highest-bid (id uint))
    (match (map-get? auctions id)
        auction (some (get current-bid auction))
        none
    )
)

(define-read-only (get-auction-status (id uint))
    (match (map-get? auctions id)
        auction (some {
            active: (get active auction),
            ended: (>= stacks-block-height (get end-block auction)),
            has-bids: (is-some (get highest-bidder auction)),
            blocks-remaining: (if (> (get end-block auction) stacks-block-height)
                (- (get end-block auction) stacks-block-height)
                u0
            ),
        })
        none
    )
)

(define-read-only (get-min-bid (id uint))
    (match (map-get? auctions id)
        auction (let (
                (current-bid (get current-bid auction))
                (min-increment (if (> (/ (* current-bid u5) u100) u10000)
                    (/ (* current-bid u5) u100)
                    u10000
                ))
            )
            (some (if (is-eq current-bid u0)
                (get reserve-price auction)
                (+ current-bid min-increment)
            ))
        )
        none
    )
)

(define-read-only (get-escrow
        (auction-id uint)
        (bidder principal)
    )
    (default-to u0
        (map-get? escrow {
            auction-id: auction-id,
            bidder: bidder,
        })
    )
)
