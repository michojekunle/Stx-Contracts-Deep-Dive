import { beforeEach, describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const address1 = accounts.get("wallet_1")!;
const address2 = accounts.get("wallet_2")!;
const address3 = accounts.get("wallet_3")!;
const address4 = accounts.get("wallet_4")!;
const address5 = accounts.get("wallet_5")!;

/*
  The test below is an example. To learn more, read the testing documentation here:
  https://docs.hiro.so/stacks/clarinet-js-sdk
*/

describe("Multisig Vault tests", () => {
  it("ensures simnet is well initialised", () => {
    expect(simnet.blockHeight).toBeDefined();
  });

  describe("Start function tests", () => {
    it("should start without fail", () => {
      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail to start when incorrect paramters are passed", () => {
      const try1 = simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        address1
      );

      expect(try1.result).toBeErr(Cl.uint(100));

      const try2 = simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(6),
        ],
        deployer
      );

      expect(try2.result).toBeErr(Cl.uint(102));

      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      const try3 = simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      // expect to throw error that contract is already locked,
      // after being already intialized by the first start function
      expect(try3.result).toBeErr(Cl.uint(101));
    });
  });

  describe("vote function", () => {
    it("should process a vote successfully", () => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address2
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should fail if voter is not a member", () => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address4
      );

      expect(result).toBeErr(Cl.uint(103));
    });
  });

  describe("deposit and withdraw functions", () => {
    it("should allow members to deposit STX", () => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "deposit",
        [Cl.uint(1000)],
        address1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("should allow withdrawal only after enough votes", () => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      simnet.callPublicFn(
        "multisig-vault",
        "deposit",
        [Cl.uint(1000)],
        address1
      );

      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address2
      );
      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address3
      );

      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "withdraw",
        [],
        address1
      );

      expect(result).toBeOk(Cl.uint(2));
    });

    it("should fail withdrawal if votes required not met", () => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );

      simnet.callPublicFn(
        "multisig-vault",
        "deposit",
        [Cl.uint(1000)],
        address1
      );

      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address2
      );

      const { result } = simnet.callPublicFn(
        "multisig-vault",
        "withdraw",
        [],
        address1
      );

      expect(result).toBeErr(Cl.uint(104));
    });
  });

  describe("get-vote and tally-votes functions", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "multisig-vault",
        "start",
        [
          Cl.list([
            Cl.address(address1),
            Cl.address(address2),
            Cl.address(address3),
          ]),
          Cl.uint(2),
        ],
        deployer
      );
      simnet.callPublicFn(
        "multisig-vault",
        "deposit",
        [Cl.uint(1000)],
        address1
      );
      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(true)],
        address2
      );
      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address2), Cl.bool(true)],
        address1
      );
      simnet.callPublicFn(
        "multisig-vault",
        "vote",
        [Cl.address(address1), Cl.bool(false)],
        address3
      );
    });

    it("should return correct vote for a member", () => {
      const { result } = simnet.callReadOnlyFn(
        "multisig-vault",
        "get-vote",
        [Cl.address(address1), Cl.address(address2)],
        address2
      );
      expect(result).toStrictEqual(Cl.bool(true));
    });

    it("should return correct value for a member's vote", () => {
      const { result } = simnet.callReadOnlyFn(
        "multisig-vault",
        "get-vote",
        [Cl.address(address1), Cl.address(address1)],
        address1
      );
      expect(result).toStrictEqual(Cl.bool(false));
    });
  });
});
