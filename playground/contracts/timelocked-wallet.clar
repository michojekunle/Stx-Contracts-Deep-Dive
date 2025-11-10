;; title: timelocked-wallet
;; version:
;; summary:
;; description:

;; traits
;;

;; token definitions
;;

;; constants
;; owner
(define-constant contract-owner tx-sender)

;; errors
(define-constant err-owner-only (err u100))
(define-constant err-already-locked (err u101))
(define-constant err-unlock-in-the-past (err u102))
(define-constant err-no-value (err u103))
(define-constant err-beneficiary-only (err u104))
(define-constant err-unlock-height-not-reached (err u105))
(define-constant err-invalid-beneficiary (err u106))

;; data vars
;;
(define-data-var beneficiary (optional principal) none)
(define-data-var unlock-height uint u0)

;; data maps
;;

;; public functions
;; lock 
(define-public (lock
        (new-beneficiary principal)
        (unlock-at uint)
        (amount uint)
    )
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (is-none (var-get beneficiary)) err-already-locked)
        (asserts! (> unlock-at stacks-block-height) err-unlock-in-the-past)
        (asserts! (> amount u0) err-no-value)
        (asserts! (not (is-none (some new-beneficiary))) err-invalid-beneficiary)
        (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
        (var-set beneficiary (some new-beneficiary))
        (var-set unlock-height unlock-at)
        (ok true)
    )
)

;; bestow
(define-public (bestow (new-beneficiary principal))
    (begin
        (asserts! (is-eq (some tx-sender) (var-get beneficiary))
            err-beneficiary-only
        )
        (var-set beneficiary (some new-beneficiary))
        (ok true)
    )
)

;; claim 
(define-public (claim)
    (begin
        (asserts! (is-eq (some tx-sender) (var-get beneficiary))
            err-beneficiary-only
        )
        (asserts! (>= stacks-block-height (var-get unlock-height))
            err-unlock-height-not-reached
        )
        (as-contract (stx-transfer? (stx-get-balance tx-sender) tx-sender
            (unwrap-panic (var-get beneficiary))
        ))
    )
)

;; read only functions
;;

;; private functions
;;
