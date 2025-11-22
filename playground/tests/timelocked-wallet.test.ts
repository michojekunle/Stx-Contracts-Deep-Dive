import { beforeEach, describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
// const address3 = accounts.get("wallet_3")!;

describe("timelocked-wallet contract tests", () => {
  beforeEach(() => {
    // Reset simnet state before each test
    simnet.mineEmptyBlock();
  });

  describe("Lock function", () => {
    it("should allow the owner to lock funds", () => {
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(1000)],
        deployer
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail if called by non-owner", () => {
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(1000)],
        address1
      );
      expect(result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("should fail if already locked", () => {
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(1000)],
        deployer
      );
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address2), Cl.uint(200), Cl.uint(2000)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(101)); // err-already-locked
    });

    it("should fail if unlock height is in the past", () => {
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(0), Cl.uint(1000)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(102)); // err-unlock-in-the-past
    });

    it("should fail if amount is zero", () => {
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(0)],
        deployer
      );
      expect(result).toBeErr(Cl.uint(103)); // err-no-value
    });
  });

  describe("Bestow function", () => {
    it("should allow beneficiary to update to new beneficiary", () => {
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(1000)],
        deployer
      );
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "bestow",
        [Cl.principal(address1)],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail if non-beneficiary tries to bestow", () => {
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(1000)],
        deployer
      );
      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "bestow",
        [Cl.principal(address2)],
        address2
      );
      expect(result).toBeErr(Cl.uint(104)); // err-beneficiary-only
    });
  });

  describe("Claim function", () => {
    it("should allow beneficiary to claim after unlock height", () => {
      const callFn = simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(100), Cl.uint(500)],
        deployer
      );

      expect(callFn.result).toBeOk(Cl.bool(true));

      simnet.mineEmptyBlocks(10000); // advance block height

      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "claim",
        [],
        address1
      );
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail if claim called before unlock height", () => {
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(1000), Cl.uint(500)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "claim",
        [],
        address1
      );
      expect(result).toBeErr(Cl.uint(105)); // err-unlock-height-not-reached
    });

    it("should fail if caller is not beneficiary", () => {
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [Cl.principal(address1), Cl.uint(1), Cl.uint(500)],
        deployer
      );
      simnet.mineEmptyBlocks(5);

      const { result } = simnet.callPublicFn(
        "timelocked-wallet",
        "claim",
        [],
        address2
      );
      expect(result).toBeErr(Cl.uint(104)); // err-beneficiary-only
    });
  });
});
