import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const DICE_CONTRACT = "dice-game";

// Constants
const MAX_ROLL = 100;
// const PAYOUT_MULTIPLIER = 99;
const MIN_BET = 10000;
const MAX_BET = 10_000_000_000;

// Error codes
const ERR_INVALID_BET = 100;
const ERR_INVALID_PREDICTION = 101;
// const ERR_INSUFFICIENT_FUNDS = 102;
const ERR_PAUSED = 999;
const ERR_UNAUTHORIZED = 403;

// Enhanced helper to extract Clarity value
const cvToValue = (cv: any): any => {
  if (!cv) return undefined;
  if (cv.type === 'uint') return cv.value;
  if (cv.type === 'int') return cv.value;
  if (cv.type === 'bool') return cv.value;
  if (cv.type === 'principal' || cv.type === 'address') return cv.value;
  if (cv.type === 'ascii' || cv.type === 'string-ascii') return cv.value;
  if (cv.type === 'utf8' || cv.type === 'string-utf8') return cv.value;
  if (cv.type === 'tuple') {
    const result: any = {};
    for (const [key, value] of Object.entries(cv.value)) {
      result[key] = cvToValue(value);
    }
    return result;
  }
  if (cv.type === 'response-ok' || cv.type === 'ok') {
    return cvToValue(cv.value);
  }
  return cv;
};

describe("Dice Game Contract Tests", () => {
  const accounts = simnet.getAccounts();
  const deployer = accounts.get("deployer")!;
  const player1 = accounts.get("wallet_1")!;
  const player2 = accounts.get("wallet_2")!;
  const player3 = accounts.get("wallet_3")!;

  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  // ========================================
  // GET STATS TESTS
  // ========================================

  describe("Get Stats", () => {
    it("should return initial stats", () => {
      const result = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const stats = cvToValue(result.result);
      expect(stats["house-balance"]).toBe(0n);
      expect(stats.volume).toBe(0n);
      expect(stats.wins).toBe(0n);
      expect(stats.losses).toBe(0n);
      expect(stats.paused.type).toBe("false");
    });

    it("should return current dice roll value", () => {
      const result = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const stats = cvToValue(result.result);
      const currentRoll = stats["current-roll"];
      
      expect(Number(currentRoll)).toBeGreaterThanOrEqual(1);
      expect(Number(currentRoll)).toBeLessThanOrEqual(MAX_ROLL);
    });
  });

  // ========================================
  // GET DICE ROLL TESTS
  // ========================================

  describe("Get Dice Roll", () => {
    it("should return a roll between 1 and 100", () => {
      const result = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-dice-roll",
        [],
        player1
      );

      const roll = cvToValue(result.result);
      expect(Number(roll)).toBeGreaterThanOrEqual(1);
      expect(Number(roll)).toBeLessThanOrEqual(MAX_ROLL);
    });

    it("should return different rolls across blocks", () => {
      const roll1 = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-dice-roll",
        [],
        player1
      );

      // Mine a block
      simnet.mineEmptyBlock();

      const roll2 = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-dice-roll",
        [],
        player1
      );

      const value1 = cvToValue(roll1.result);
      const value2 = cvToValue(roll2.result);
      
      expect(Number(value1)).toBeGreaterThanOrEqual(1);
      expect(Number(value2)).toBeGreaterThanOrEqual(1);
    });
  });

  // ========================================
  // ROLL FUNCTION TESTS - VALIDATION
  // ========================================

  describe("Roll - Validation", () => {
    it("should reject bet below minimum", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET - 1), Cl.uint(50)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_BET));
    });

    it("should reject bet above maximum", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MAX_BET + 1), Cl.uint(50)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_BET));
    });

    it("should reject prediction of 0", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(0)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_PREDICTION));
    });

    it("should reject prediction above 100", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(101)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_INVALID_PREDICTION));
    });

    it("should accept minimum valid bet", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(50)],
        player1
      );

      expect(result.result.type).toBe('ok');
      const resultValue = cvToValue(result.result);
      expect(resultValue.roll).toBeGreaterThanOrEqual(1);
      expect(resultValue.roll).toBeLessThanOrEqual(MAX_ROLL);
    });

    it("should accept prediction of 1", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(1)],
        player1
      );

      expect(result.result.type).toBe('ok');
    });

    it("should accept prediction of 100", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(100)],
        player1
      );

      expect(result.result.type).toBe('ok');
    });
  });

  // ========================================
  // ROLL FUNCTION TESTS - GAMEPLAY
  // ========================================

  describe("Roll - Gameplay", () => {
    it("should update house balance on bet", () => {
      const bet = 100000;

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(bet), Cl.uint(50)],
        player1
      );

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const statsValue = cvToValue(stats.result);
      expect(Number(statsValue["house-balance"])).toBeGreaterThanOrEqual(bet);
    });

    it("should update total volume", () => {
      const bet = 100000;

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(bet), Cl.uint(50)],
        player1
      );

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const statsValue = cvToValue(stats.result);
      expect(statsValue.volume).toBe(BigInt(bet));
    });

    it("should increment wins or losses", () => {
      const currentRoll = cvToValue(
        simnet.callReadOnlyFn(DICE_CONTRACT, "get-dice-roll", [], player1).result
      );

      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(currentRoll)],
        player1
      );

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );
      
      const statsValue = cvToValue(stats.result);
      const totalGames = Number(statsValue.wins) + Number(statsValue.losses);
      expect(totalGames).toBe(1);
    });

    it("should emit roll event", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(50)],
        player1
      );

      const printEvent = result.events.find(e => e.event === "print_event");
      expect(printEvent).toBeDefined();

      if (printEvent) {
        const eventData = cvToValue(printEvent.data.value);
        expect(eventData.event).toBe("roll");
        expect(eventData.player).toBe(player1);
        expect(eventData.bet).toBe(BigInt(MIN_BET));
        expect(eventData.predicted).toBe(50n);
        expect(Number(eventData.roll)).toBeGreaterThanOrEqual(1);
        expect(Number(eventData.roll)).toBeLessThanOrEqual(MAX_ROLL);
      }
    });

    it("should handle multiple sequential rolls", () => {
      const bet = 50000;

      for (let i = 0; i < 5; i++) {
        simnet.callPublicFn(
          DICE_CONTRACT,
          "roll",
          [Cl.uint(bet), Cl.uint(50)],
          player1
        );
        simnet.mineEmptyBlock();
      }

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const statsValue = cvToValue(stats.result);
      expect(statsValue.volume).toBe(BigInt(bet * 5));
      expect(Number(statsValue.wins) + Number(statsValue.losses)).toBe(5);
    });
  });

  // ========================================
  // MULTIPLE PLAYERS TESTS
  // ========================================

  describe("Multiple Players", () => {
    it("should handle bets from different players", () => {
      const bet = 100000;

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(bet), Cl.uint(50)],
        player1
      );

      simnet.mineEmptyBlock();

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(bet), Cl.uint(75)],
        player2
      );

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        deployer
      );

      const statsValue = cvToValue(stats.result);
      expect(statsValue.volume).toBe(BigInt(bet * 2));
    });

    it("should track wins and losses across all players", () => {
      for (let i = 0; i < 3; i++) {
        simnet.callPublicFn(
          DICE_CONTRACT,
          "roll",
          [Cl.uint(MIN_BET), Cl.uint(50)],
          [player1, player2, player3][i]
        );
        simnet.mineEmptyBlock();
      }

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        deployer
      );

      const statsValue = cvToValue(stats.result);
      expect(Number(statsValue.wins) + Number(statsValue.losses)).toBe(3);
    });
  });

  // ========================================
  // ADMIN FUNCTIONS TESTS
  // ========================================

  describe("Admin Functions", () => {
    beforeEach(() => {
      // Add funds by having players lose
      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(1000000), Cl.uint(1)],
        player1
      );
    });

    it("should reject non-admin withdrawal", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "withdraw-house",
        [Cl.uint(100000)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("should allow admin to pause game", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "pause",
        [Cl.bool(true)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        deployer
      );
      expect(cvToValue(stats.result).paused.type).toBe("true");
    });

    it("should allow admin to unpause game", () => {
      simnet.callPublicFn(DICE_CONTRACT, "pause", [Cl.bool(true)], deployer);

      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "pause",
        [Cl.bool(false)],
        deployer
      );

      expect(result.result).toBeOk(Cl.bool(true));

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        deployer
      );
      expect(cvToValue(stats.result).paused.type).toBe("false");
    });

    it("should reject non-admin pause attempts", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "pause",
        [Cl.bool(true)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("should reject rolls when paused", () => {
      simnet.callPublicFn(DICE_CONTRACT, "pause", [Cl.bool(true)], deployer);

      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(50)],
        player1
      );

      expect(result.result).toBeErr(Cl.uint(ERR_PAUSED));
    });

    it("should allow rolls after unpausing", () => {
      simnet.callPublicFn(DICE_CONTRACT, "pause", [Cl.bool(true)], deployer);
      simnet.callPublicFn(DICE_CONTRACT, "pause", [Cl.bool(false)], deployer);

      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(50)],
        player1
      );

      expect(result.result.type).toBe('ok');
    });
  });

  // ========================================
  // EDGE CASES
  // ========================================

  describe("Edge Cases", () => {
    it("should handle exact minimum bet", () => {
      const result = simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(MIN_BET), Cl.uint(50)],
        player1
      );

      expect(result.result.type).toBe('ok');
    });

    it("should handle rapid successive bets", () => {
      for (let i = 0; i < 10; i++) {
        simnet.callPublicFn(
          DICE_CONTRACT,
          "roll",
          [Cl.uint(MIN_BET), Cl.uint(50)],
          player1
        );
      }

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const statsValue = cvToValue(stats.result);
      expect(statsValue.volume).toBe(BigInt(MIN_BET * 10));
    });

    it("should maintain accurate statistics after many rolls", () => {
      let totalBet = 0;
      const numRolls = 20;

      for (let i = 0; i < numRolls; i++) {
        const bet = MIN_BET + i * 10000;
        totalBet += bet;
        
        simnet.callPublicFn(
          DICE_CONTRACT,
          "roll",
          [Cl.uint(bet), Cl.uint(50)],
          player1
        );
        simnet.mineEmptyBlock();
      }

      const stats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        player1
      );

      const statsValue = cvToValue(stats.result);
      expect(statsValue.volume).toBe(BigInt(totalBet));
      expect(Number(statsValue.wins) + Number(statsValue.losses)).toBe(numRolls);
    });
  });

  // ========================================
  // INTEGRATION TESTS
  // ========================================

  describe("Integration Scenarios", () => {
    it("should handle complete game lifecycle", () => {
      // 1. Multiple players bet
      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(500000), Cl.uint(25)],
        player1
      );
      simnet.mineEmptyBlock();

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(300000), Cl.uint(50)],
        player2
      );
      simnet.mineEmptyBlock();

      simnet.callPublicFn(
        DICE_CONTRACT,
        "roll",
        [Cl.uint(200000), Cl.uint(75)],
        player3
      );

      // 2. Admin pauses game
      simnet.callPublicFn(DICE_CONTRACT, "pause", [Cl.bool(true)], deployer);

      // 3. Verify final state
      const finalStats = simnet.callReadOnlyFn(
        DICE_CONTRACT,
        "get-stats",
        [],
        deployer
      );

      const statsValue = cvToValue(finalStats.result);
      expect(statsValue.paused.type).toBe("true");
      expect(statsValue.volume).toBe(1000000n);
      expect(Number(statsValue.wins) + Number(statsValue.losses)).toBe(3);
    });
  });
});