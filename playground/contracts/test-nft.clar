(impl-trait .sip-009-nft-trait.nft-trait)

(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u401))
(define-constant ERR_NOT_FOUND (err u404))

(define-non-fungible-token test-nft uint)

(define-data-var last-token-id uint u0)

;; SIP-009 Functions

(define-read-only (get-last-token-id)
    (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
    (ok (some u"https://example.com/metadata/{id}.json"))
)

(define-read-only (get-owner (token-id uint))
    (ok (nft-get-owner? test-nft token-id))
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
    (begin
        (asserts! (is-eq tx-sender sender) ERR_NOT_AUTHORIZED)
        (nft-transfer? test-nft token-id sender recipient)
    )
)

;; Mint function for testing
(define-public (mint (recipient principal))
    (let ((token-id (+ (var-get last-token-id) u1)))
        (try! (nft-mint? test-nft token-id recipient))
        (var-set last-token-id token-id)
        (ok token-id)
    )
)