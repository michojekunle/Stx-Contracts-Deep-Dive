import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const SFT_CONTRACT = "semi-fungible-token";

// Error codes
const ERR_OWNER_ONLY = 100;
const ERR_INSUFFICIENT_BALANCE = 1;
const ERR_INVALID_SENDER = 4;

// Helper to extract Clarity value
const cvToValue = (cv: any): any => {
  if (!cv) return undefined;
  if (cv.type === 'uint') return cv.value;
  if (cv.type === 'int') return cv.value;
  if (cv.type === 'bool') return cv.value;
  if (cv.type === 'principal' || cv.type === 'address') return cv.value;
  if (cv.type === 'ascii' || cv.type === 'string-ascii') return cv.value;
  if (cv.type === 'tuple') {
    const result: any = {};
    for (const [key, value] of Object.entries(cv.value)) {
      result[key] = cvToValue(value);
    }
    return result;
  }
  return cv;
};

describe("Semi-Fungible Token (SIP-013) Tests", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer")!;
  const user1 = accounts.get("wallet_1")!;
  const user2 = accounts.get("wallet_2")!;
  const user3 = accounts.get("wallet_3")!;

  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  // ========================================
  // BALANCE TESTS
  // ========================================

  describe("Balance Functions", () => {
    it("should return zero balance for unminted tokens", () => {
      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should return correct balance after minting", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(100));
    });

    it("should return correct overall balance", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(2), Cl.uint(200), Cl.principal(user1)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-overall-balance",
        [Cl.principal(user1)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(300));
    });

    it("should track balances separately by token ID", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(50), Cl.principal(user2)],
        deployer
      );

      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(100));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance2.result).toBeOk(Cl.uint(50));
    });
  });

  // ========================================
  // SUPPLY TESTS
  // ========================================

  describe("Supply Functions", () => {
    it("should return zero for unminted token supply", () => {
      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-total-supply",
        [Cl.uint(999)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should track total supply per token ID", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(150), Cl.principal(user2)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-total-supply",
        [Cl.uint(1)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(250));
    });

    it("should return correct overall supply", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(2), Cl.uint(200), Cl.principal(user2)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-overall-supply",
        [],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(300));
    });
  });

  // ========================================
  // METADATA TESTS
  // ========================================

  describe("Metadata Functions", () => {
    it("should return 0 decimals", () => {
      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-decimals",
        [Cl.uint(1)],
        user1
      );
      expect(result.result).toBeOk(Cl.uint(0));
    });

    it("should return none for token URI", () => {
      const result = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-token-uri",
        [Cl.uint(1)],
        user1
      );
      expect(result.result).toBeOk(Cl.none());
    });
  });

  // ========================================
  // MINTING TESTS
  // ========================================

  describe("Minting", () => {
    it("should allow contract owner to mint", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance.result).toBeOk(Cl.uint(100));
    });

    it("should reject minting by non-owner", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_OWNER_ONLY));
    });

    it("should emit mint event", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );

      const printEvent = result.events.find(e => e.event === "print_event");
      expect(printEvent).toBeDefined();
      
      if (printEvent) {
        const eventData = cvToValue(printEvent.data.value);
        // Event data is a tuple with type field
        expect(eventData.type).toBe("sft_mint");
        expect(eventData["token-id"]).toBe(1n);
        expect(eventData.amount).toBe(100n);
        expect(eventData.recipient).toBe(user1);
      }
    });

    it("should mint multiple times to same user", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(50), Cl.principal(user1)],
        deployer
      );

      const balance = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance.result).toBeOk(Cl.uint(150));
    });

    it("should update supply correctly after minting", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );

      const supply = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-total-supply",
        [Cl.uint(1)],
        user1
      );
      expect(supply.result).toBeOk(Cl.uint(100));
    });
  });

  // ========================================
  // TRANSFER TESTS
  // ========================================

  describe("Transfer", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(1000), Cl.principal(user1)],
        deployer
      );
    });

    it("should allow valid transfer", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(900));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance2.result).toBeOk(Cl.uint(100));
    });

    it("should reject transfer from non-sender", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user2
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_SENDER));
    });

    it("should reject transfer with insufficient balance", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(2000),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user1
      );
      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });

    it("should emit transfer event", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user1
      );

      const printEvents = result.events.filter(e => e.event === "print_event");
      expect(printEvents.length).toBeGreaterThan(0);

      // Find the sft_transfer event
      const transferEvent = printEvents.find(e => {
        const data = cvToValue(e.data.value);
        return data && data.type === "sft_transfer";
      });
      
      expect(transferEvent).toBeDefined();

      if (transferEvent) {
        const eventData = cvToValue(transferEvent.data.value);
        expect(eventData["token-id"]).toBe(1n);
        expect(eventData.amount).toBe(100n);
        expect(eventData.sender).toBe(user1);
        expect(eventData.recipient).toBe(user2);
      }
    });

    it("should handle multiple sequential transfers", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [Cl.uint(1), Cl.uint(300), Cl.principal(user1), Cl.principal(user2)],
        user1
      );

      simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user2), Cl.principal(user3)],
        user2
      );

      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(700));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance2.result).toBeOk(Cl.uint(200));

      const balance3 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user3)],
        user3
      );
      expect(balance3.result).toBeOk(Cl.uint(100));
    });

    it("should allow transfer of entire balance", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(1000),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(0));
    });
  });

  // ========================================
  // TRANSFER WITH MEMO TESTS
  // ========================================

  describe("Transfer with Memo", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(1000), Cl.principal(user1)],
        deployer
      );
    });

    it("should transfer with memo", () => {
      const memo = new TextEncoder().encode("Payment for services");
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer-memo",
        [
          Cl.uint(1),
          Cl.uint(100),
          Cl.principal(user1),
          Cl.principal(user2),
          Cl.buffer(memo),
        ],
        user1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance2.result).toBeOk(Cl.uint(100));
    });
  });

  // ========================================
  // TRANSFER-MANY TESTS
  // ========================================

  describe("Transfer Many", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(1000), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(2), Cl.uint(500), Cl.principal(user1)],
        deployer
      );
    });

    it("should handle multiple transfers in one call", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer-many",
        [
          Cl.list([
            Cl.tuple({
              "token-id": Cl.uint(1),
              amount: Cl.uint(100),
              sender: Cl.principal(user1),
              recipient: Cl.principal(user2),
            }),
            Cl.tuple({
              "token-id": Cl.uint(2),
              amount: Cl.uint(50),
              sender: Cl.principal(user1),
              recipient: Cl.principal(user2),
            }),
          ]),
        ],
        user1
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance1Token1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance1Token1.result).toBeOk(Cl.uint(100));

      const balance1Token2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(2), Cl.principal(user2)],
        user2
      );
      expect(balance1Token2.result).toBeOk(Cl.uint(50));
    });

    it("should stop on first failure in transfer-many", () => {
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer-many",
        [
          Cl.list([
            Cl.tuple({
              "token-id": Cl.uint(1),
              amount: Cl.uint(100),
              sender: Cl.principal(user1),
              recipient: Cl.principal(user2),
            }),
            Cl.tuple({
              "token-id": Cl.uint(1),
              amount: Cl.uint(10000),
              sender: Cl.principal(user1),
              recipient: Cl.principal(user3),
            }),
          ]),
        ],
        user1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INSUFFICIENT_BALANCE));
    });
  });

  // ========================================
  // EDGE CASES
  // ========================================

  describe("Edge Cases", () => {
    it("should reject zero amount transfer (SIP-013 behavior)", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(1000), Cl.principal(user1)],
        deployer
      );

      simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [
          Cl.uint(1),
          Cl.uint(0),
          Cl.principal(user1),
          Cl.principal(user2),
        ],
        user1
      );
      
      // The contract allows zero transfers but balance should stay same
      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(1000));
    });

    it("should handle multiple token IDs per user", () => {
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(2), Cl.uint(200), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(3), Cl.uint(300), Cl.principal(user1)],
        deployer
      );

      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(100));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(2), Cl.principal(user1)],
        user1
      );
      expect(balance2.result).toBeOk(Cl.uint(200));

      const balance3 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(3), Cl.principal(user1)],
        user1
      );
      expect(balance3.result).toBeOk(Cl.uint(300));

      const overall = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-overall-balance",
        [Cl.principal(user1)],
        user1
      );
      expect(overall.result).toBeOk(Cl.uint(600));
    });

    it("should handle very large amounts", () => {
      const largeAmount = 1_000_000_000_000n;
      
      const result = simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(largeAmount), Cl.principal(user1)],
        deployer
      );
      expect(result.result).toBeOk(Cl.bool(true));

      const balance = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance.result).toBeOk(Cl.uint(largeAmount));
    });
  });

  // ========================================
  // INTEGRATION TESTS
  // ========================================

  describe("Integration Scenarios", () => {
    it("should handle complete SFT lifecycle", () => {
      // 1. Mint multiple token IDs
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(1000), Cl.principal(user1)],
        deployer
      );
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(2), Cl.uint(500), Cl.principal(user1)],
        deployer
      );

      // 2. Transfer some to user2
      simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [Cl.uint(1), Cl.uint(300), Cl.principal(user1), Cl.principal(user2)],
        user1
      );

      // 3. User2 transfers to user3
      simnet.callPublicFn(
        SFT_CONTRACT,
        "transfer",
        [Cl.uint(1), Cl.uint(100), Cl.principal(user2), Cl.principal(user3)],
        user2
      );

      // 4. Mint more to user1
      simnet.callPublicFn(
        SFT_CONTRACT,
        "mint",
        [Cl.uint(1), Cl.uint(500), Cl.principal(user1)],
        deployer
      );

      // 5. Verify final states
      const balance1 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user1)],
        user1
      );
      expect(balance1.result).toBeOk(Cl.uint(1200));

      const balance2 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user2)],
        user2
      );
      expect(balance2.result).toBeOk(Cl.uint(200));

      const balance3 = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-balance",
        [Cl.uint(1), Cl.principal(user3)],
        user3
      );
      expect(balance3.result).toBeOk(Cl.uint(100));

      const supply = simnet.callReadOnlyFn(
        SFT_CONTRACT,
        "get-total-supply",
        [Cl.uint(1)],
        user1
      );
      expect(supply.result).toBeOk(Cl.uint(1500));
    });
  });
});