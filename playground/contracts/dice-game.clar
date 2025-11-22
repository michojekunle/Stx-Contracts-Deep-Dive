(define-constant MAX_ROLL u100)
(define-constant PAYOUT_MULTIPLIER u99)      
(define-constant MIN_BET u10000)             ;; 0.00001 STX
(define-constant MAX_BET u10000000000)       ;; 10,000 STX

(define-constant ERR_INVALID_BET (err u100))
(define-constant ERR_INVALID_PREDICTION (err u101))
(define-constant ERR_INSUFFICIENT_FUNDS (err u102))
(define-constant ERR_PAUSED (err u999))
(define-constant ERR_UNAUTHORIZED (err u403))

(define-data-var house-balance uint u0)
(define-data-var total-volume uint u0)
(define-data-var total-wins uint u0)
(define-data-var total-losses uint u0)
(define-data-var paused bool false)
(define-data-var admin principal tx-sender)


(define-read-only (get-dice-roll)
  (+ u1
     (mod
       ;; Convert last 8 bytes of previous Stacks block hash to uint
       (buff-to-uint-le
         (unwrap-panic
           (as-max-len?
             (unwrap-panic
               (slice?
                 (unwrap-panic
                   (get-stacks-block-info? id-header-hash (- stacks-block-height u1)))
                 u24 u32))  ;; take last 8 bytes
             u8)))
       u100))) 

;; MAIN ROLL FUNCTION
(define-public (roll (bet uint) (predicted uint))
  (let (
    (player tx-sender)
    (roll-result (get-dice-roll))
    (win? (is-eq roll-result predicted))
    (payout (if win? (* bet PAYOUT_MULTIPLIER) u0))
  )
    ;; Validation
    (asserts! (not (var-get paused)) ERR_PAUSED)
    (asserts! (and (>= bet MIN_BET) (<= bet MAX_BET)) ERR_INVALID_BET)
    (asserts! (and (>= predicted u1) (<= predicted MAX_ROLL)) ERR_INVALID_PREDICTION)
    (asserts! (or (not win?) (<= payout (var-get house-balance))) ERR_INSUFFICIENT_FUNDS)

    ;; Take bet
    (try! (stx-transfer? bet player (as-contract tx-sender)))
    (var-set house-balance (+ (var-get house-balance) bet))
    (var-set total-volume (+ (var-get total-volume) bet))

    ;; Pay winner
    (if win?
      (begin
        (var-set house-balance (- (var-get house-balance) payout))
        (var-set total-wins (+ (var-get total-wins) u1))
        (as-contract (try! (stx-transfer? payout tx-sender player)))
      )
      (var-set total-losses (+ (var-get total-losses) u1))
    )

    ;; Event
    (print {
      event: "roll",
      player: player,
      bet: bet,
      predicted: predicted,
      roll: roll-result,
      win: win?,
      payout: payout,
      block: stacks-block-height
    })

    (ok {
      roll: roll-result,
      win: win?,
      payout: payout
    })
  )
)

;; ADMIN
(define-public (withdraw-house (amount uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_UNAUTHORIZED)
    (var-set house-balance (- (var-get house-balance) amount))
    (as-contract (try! (stx-transfer? amount tx-sender tx-sender)))
    (ok true)
  )
)

(define-public (pause (state bool))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_UNAUTHORIZED)
    (var-set paused state)
    (ok true)
  )
)

(define-read-only (get-stats)
  (ok {
    house-balance: (var-get house-balance),
    volume: (var-get total-volume),
    wins: (var-get total-wins),
    losses: (var-get total-losses),
    paused: (var-get paused),
    current-roll: (get-dice-roll)
  })
)