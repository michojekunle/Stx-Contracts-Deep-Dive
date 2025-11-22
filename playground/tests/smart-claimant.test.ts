import { beforeEach, describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;

describe("smart-claimant contract tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlock();
  });

  describe("Claim integration", () => {
    it("should call timelocked-wallet claim successfully", () => {
      // Step 1: Lock funds for address1 as beneficiary
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [
          Cl.principal(`${deployer}.smart-claimant`),
          Cl.uint(100),
          Cl.uint(1000),
        ],
        deployer
      );
      simnet.mineEmptyBlocks(1000);

      // Step 2: Trigger smart-claimant claim, which calls timelocked-wallet claim
      const { result } = simnet.callPublicFn(
        "smart-claimant",
        "claim",
        [],
        address1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail if timelocked-wallet claim fails", () => {
      // No funds locked => claim will fail
      const { result } = simnet.callPublicFn(
        "smart-claimant",
        "claim",
        [],
        address1
      );
      expect(result).toBeErr(Cl.uint(104)); // beneficiary-only or other error propagated
    });

    it("should correctly distribute funds to 4 recipients", () => {
      // Lock for address1
      simnet.callPublicFn(
        "timelocked-wallet",
        "lock",
        [
          Cl.principal(`${deployer}.smart-claimant`),
          Cl.uint(100),
          Cl.uint(4000),
        ],
        deployer
      );
      
      simnet.mineEmptyBlocks(1000);

      const assets = simnet.getAssetsMap();
      const stxBalances = assets.get("STX")!;
      const initialBalance = stxBalances.get(address1)!; // bigint in microSTX

      simnet.callPublicFn("smart-claimant", "claim", [], address1);

      const finalAssets = simnet.getAssetsMap();
      const finalStxBalances = finalAssets.get("STX")!;
      const finalBalance = finalStxBalances.get(address1)!; // bigint in microSTX

      // Expect sender’s balance to decrease by total-claimed amount
      expect(finalBalance).toBeGreaterThan(initialBalance);
    });
  });
});
