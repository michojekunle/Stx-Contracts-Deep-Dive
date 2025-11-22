(define-trait sip013-transfer-many-trait
  (
    (transfer-many ((list 200 {token-id: uint, amount: uint}) principal principal) (response bool uint))
  )
)