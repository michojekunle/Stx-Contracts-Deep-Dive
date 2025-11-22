(define-trait sip013-semi-fungible-token-trait
  (
    ;; Transfer one or more token-ids of the same token-type
    (transfer-many ((list 200 {token-id: uint, amount: uint}) principal principal) (response bool uint))
    
    ;; Transfer a single token-id of a token-type
    (transfer (uint uint principal principal) (response bool uint))
    
    ;; Get balance of a token-type for a principal
    (get-balance-uint (uint principal) (response (list 200 uint) uint))
    
    ;; Get total supply of a token-type
    (get-total-supply-uint (uint) (response (list 200 uint) uint))
    
    ;; Get token-uri for a token-type
    (get-token-uri (uint) (response (optional (string-utf8 256)) uint))
    
    ;; Get decimals (optional)
    (get-decimals (uint) (response uint uint))
  )
)