import { beforeEach, describe, expect, it } from "vitest";
import { Cl, ClarityType, cvToValue } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const seller = accounts.get("wallet_1")!;
const bidder1 = accounts.get("wallet_2")!;
const bidder2 = accounts.get("wallet_3")!;
const royaltyRecipient = accounts.get("wallet_4")!;

const AUCTION_CONTRACT = "nft-auction";
const NFT_CONTRACT = "test-nft";

// Error constants
// const ERR_NOT_OWNER = 100;
const ERR_AUCTION_NOT_ACTIVE = 101;
const ERR_BID_TOO_LOW = 102;
const ERR_AUCTION_EXPIRED = 103;
const ERR_AUCTION_NOT_ENDED = 104;
const ERR_NO_BIDS = 105;
const ERR_UNAUTHORIZED = 106;
const ERR_INVALID_PERCENT = 107;
const ERR_INVALID_DURATION = 108;

// Helper functions
function mintNFT(recipient: string) {
  return simnet.callPublicFn(
    NFT_CONTRACT,
    "mint",
    [Cl.principal(recipient)],
    deployer
  );
}

function createAuction(
  tokenId: number,
  durationBlocks: number,
  reservePrice: number,
  royaltyPercent: number,
  royaltyRecip: string,
  senderAddress: string
) {
  return simnet.callPublicFn(
    AUCTION_CONTRACT,
    "create-auction",
    [
      Cl.contractPrincipal(deployer, NFT_CONTRACT),
      Cl.uint(tokenId),
      Cl.uint(durationBlocks),
      Cl.uint(reservePrice),
      Cl.uint(royaltyPercent),
      Cl.principal(royaltyRecip),
    ],
    senderAddress
  );
}

function placeBid(auctionId: number, amount: number, senderAddress: string) {
  return simnet.callPublicFn(
    AUCTION_CONTRACT,
    "bid",
    [Cl.uint(auctionId), Cl.uint(amount)],
    senderAddress
  );
}

function endAuction(auctionId: number, senderAddress: string) {
  return simnet.callPublicFn(
    AUCTION_CONTRACT,
    "end-auction",
    [Cl.uint(auctionId), Cl.contractPrincipal(deployer, NFT_CONTRACT)],
    senderAddress
  );
}

function cancelAuction(auctionId: number, senderAddress: string) {
  return simnet.callPublicFn(
    AUCTION_CONTRACT,
    "cancel-auction",
    [Cl.uint(auctionId), Cl.contractPrincipal(deployer, NFT_CONTRACT)],
    senderAddress
  );
}

function getAuction(auctionId: number) {
  return simnet.callReadOnlyFn(
    AUCTION_CONTRACT,
    "get-auction",
    [Cl.uint(auctionId)],
    deployer
  );
}

function getMinBid(auctionId: number) {
  return simnet.callReadOnlyFn(
    AUCTION_CONTRACT,
    "get-min-bid",
    [Cl.uint(auctionId)],
    deployer
  );
}

function getAuctionStatus(auctionId: number) {
  return simnet.callReadOnlyFn(
    AUCTION_CONTRACT,
    "get-auction-status",
    [Cl.uint(auctionId)],
    deployer
  );
}

function getEscrow(auctionId: number, bidderAddress: string) {
  return simnet.callReadOnlyFn(
    AUCTION_CONTRACT,
    "get-escrow",
    [Cl.uint(auctionId), Cl.principal(bidderAddress)],
    deployer
  );
}

// ============================================================================
// TESTS
// ============================================================================

describe("nft-auction contract tests", () => {
  // ==========================================================================
  // CREATE AUCTION TESTS
  // ==========================================================================
  describe("create-auction", () => {
    it("should successfully create auction with valid parameters", () => {
      const mintResult = mintNFT(seller);
      expect(mintResult.result).toBeOk(Cl.uint(1));

      const { result } = createAuction(
        1,
        150,
        1000000,
        500,
        royaltyRecipient,
        seller
      );
      expect(result).toBeOk(Cl.uint(0));

      const auction = getAuction(0);
      const auctionData = cvToValue(auction.result);
      expect(auctionData.value["seller"].value).toBe(seller);
      expect(auctionData.value["reserve-price"].value).toBe("1000000");
      expect(auctionData.value["active"].value).toBe(true);
    });

    it("should fail with duration too short (< 100 blocks)", () => {
      mintNFT(seller);
      const { result } = createAuction(
        1,
        50,
        1000000,
        500,
        royaltyRecipient,
        seller
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_DURATION));
    });

    it("should fail with royalty percentage too high (> 10%)", () => {
      mintNFT(seller);
      const { result } = createAuction(
        1,
        150,
        1000000,
        1500,
        royaltyRecipient,
        seller
      );
      expect(result).toBeErr(Cl.uint(ERR_INVALID_PERCENT));
    });

    it("should fail with zero reserve price", () => {
      mintNFT(seller);
      const { result } = createAuction(
        1,
        150,
        0,
        500,
        royaltyRecipient,
        seller
      );
      expect(result).toBeErr(Cl.uint(ERR_BID_TOO_LOW));
    });

    it("should increment auction nonce correctly", () => {
      mintNFT(seller);
      mintNFT(seller);
      mintNFT(seller);

      const r1 = createAuction(1, 150, 1000000, 0, seller, seller);
      const r2 = createAuction(2, 150, 2000000, 0, seller, seller);
      const r3 = createAuction(3, 150, 3000000, 0, seller, seller);

      expect(r1.result).toBeOk(Cl.uint(0));
      expect(r2.result).toBeOk(Cl.uint(1));
      expect(r3.result).toBeOk(Cl.uint(2));
    });

    it("should transfer NFT to contract on creation", () => {
      mintNFT(seller);
      const { events } = createAuction(1, 150, 1000000, 0, seller, seller);

      const transferEvent = events.find(
        (e) => e.event === "nft_transfer_event"
      );
      expect(transferEvent).toBeDefined();
      expect(transferEvent!.data.sender).toBe(seller);
      expect(transferEvent!.data.recipient).toBe(
        `${deployer}.${AUCTION_CONTRACT}`
      );
    });
  });

  // ==========================================================================
  // PLACE BID TESTS
  // ==========================================================================
  describe("bid", () => {
    beforeEach(() => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
    });

    it("should place first bid at reserve price", () => {
      const { result } = placeBid(0, 1000000, bidder1);
      expect(result).toBeOk(Cl.bool(true));

      const auction = getAuction(0);
      const data = cvToValue(auction.result);
      expect(data.value["current-bid"].value).toBe("1000000");
    });

    it("should fail when bid is below reserve", () => {
      const { result } = placeBid(0, 500000, bidder1);
      expect(result).toBeErr(Cl.uint(ERR_BID_TOO_LOW));
    });

    it("should fail when increment is too low", () => {
      placeBid(0, 1000000, bidder1);
      const { result } = placeBid(0, 1005000, bidder2);
      expect(result).toBeErr(Cl.uint(ERR_BID_TOO_LOW));
    });

    it("should accept minimum increment (10000 microSTX)", () => {
      const { result } = placeBid(0, 1010000, bidder2);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should use 5% increment when higher than 10000", () => {
      mintNFT(seller);
      createAuction(2, 150, 10000000, 0, seller, seller);
      placeBid(1, 10000000, bidder1);

      const lowBid = placeBid(1, 10400000, bidder2);
      expect(lowBid.result).toBeErr(Cl.uint(ERR_BID_TOO_LOW));

      const validBid = placeBid(1, 10500000, bidder2);
      expect(validBid.result).toBeOk(Cl.bool(true));
    });

    it("should refund previous highest bidder when outbid", () => {
      const balBefore = simnet.getAssetsMap().get("STX")?.get(bidder1) || 0n;

      placeBid(0, 1000000, bidder1);
      const balAfterBid = simnet.getAssetsMap().get("STX")?.get(bidder1) || 0n;
      expect(balAfterBid).toBe(balBefore - 1000000n);

      placeBid(0, 1100000, bidder2);
      const balAfterRefund =
        simnet.getAssetsMap().get("STX")?.get(bidder1) || 0n;
      expect(balAfterRefund).toBe(balBefore);
    });

    it("should update escrow correctly when outbid", () => {
      placeBid(0, 1000000, bidder1);
      expect(getEscrow(0, bidder1).result).toBeUint(1000000);

      placeBid(0, 1100000, bidder2);
      expect(getEscrow(0, bidder1).result).toBeUint(0);
      expect(getEscrow(0, bidder2).result).toBeUint(1100000);
    });

    it("should prevent seller from bidding", () => {
      const { result } = placeBid(0, 1000000, seller);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("should fail on expired auction", () => {
      simnet.mineEmptyBlocks(160);
      const { result } = placeBid(0, 1000000, bidder1);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_EXPIRED));
    });

    it("should fail on inactive auction", () => {
      cancelAuction(0, seller);
      const { result } = placeBid(0, 1000000, bidder1);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    it("should fail on non-existent auction", () => {
      const { result } = placeBid(999, 1000000, bidder1);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    it("should extend auction on late bid", () => {
      let auction = getAuction(0);
      const originalEnd = cvToValue(auction.result).value["end-block"].value;

      const blocksToMine = Number(originalEnd) - simnet.blockHeight - 5;
      simnet.mineEmptyBlocks(blocksToMine);

      placeBid(0, 1000000, bidder1);

      auction = getAuction(0);
      const newEnd = cvToValue(auction.result).value["end-block"].value;
      expect(Number(newEnd)).toBeGreaterThan(Number(originalEnd));
    });

    it("should NOT extend auction on early bid", () => {
      let auction = getAuction(0);
      const originalEnd = cvToValue(auction.result).value["end-block"].value;

      placeBid(0, 1000000, bidder1);

      auction = getAuction(0);
      const newEnd = cvToValue(auction.result).value["end-block"].value;
      expect(newEnd).toBe(originalEnd);
    });

    it("should transfer STX to contract on bid", () => {
      const { events } = placeBid(0, 1000000, bidder1);

      const stxTransfer = events.find((e) => e.event === "stx_transfer_event");
      expect(stxTransfer).toBeDefined();
      expect(stxTransfer!.data.amount).toBe("1000000");
      expect(stxTransfer!.data.sender).toBe(bidder1);
    });
  });

  // ==========================================================================
  // END AUCTION TESTS
  // ==========================================================================
  describe("end-auction", () => {
    it("should end auction with winner and transfer NFT", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      simnet.mineEmptyBlocks(160);
      const { result, events } = endAuction(0, deployer);

      expect(result).toBeOk(Cl.bool(true));

      const nftTransfer = events.find((e) => e.event === "nft_transfer_event");
      expect(nftTransfer).toBeDefined();
      expect(nftTransfer!.data.recipient).toBe(bidder1);
    });

    it("should pay seller full amount when no royalty", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      const balBefore = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const balAfter = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      expect(balAfter - balBefore).toBe(1000000n);
    });

    it("should correctly distribute royalties", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 500, royaltyRecipient, seller);
      placeBid(0, 10000000, bidder1);

      const sellerBefore = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyBefore =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const sellerAfter = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyAfter =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      expect(royaltyAfter - royaltyBefore).toBe(500000n);
      expect(sellerAfter - sellerBefore).toBe(9500000n);
    });

    it("should return NFT to seller when no bids", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      simnet.mineEmptyBlocks(160);
      const { result, events } = endAuction(0, deployer);

      expect(result).toBeOk(Cl.bool(true));

      const nftTransfer = events.find((e) => e.event === "nft_transfer_event");
      expect(nftTransfer!.data.recipient).toBe(seller);
    });

    it("should mark auction as inactive", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const auction = getAuction(0);
      const data = cvToValue(auction.result);
      expect(data.value["active"].value).toBe(false);
    });

    it("should fail when auction not ended yet", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      const { result } = endAuction(0, deployer);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ENDED));
    });

    it("should fail when auction is not active", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      cancelAuction(0, seller);

      simnet.mineEmptyBlocks(160);
      const { result } = endAuction(0, deployer);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    it("should fail when ending same auction twice", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      simnet.mineEmptyBlocks(160);

      const first = endAuction(0, deployer);
      expect(first.result).toBeOk(Cl.bool(true));

      const second = endAuction(0, deployer);
      expect(second.result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    // it("should fail with wrong NFT contract", () => {
    //   mintNFT(seller);
    //   createAuction(1, 150, 1000000, 0, seller, seller);

    //   simnet.mineEmptyBlocks(160);

    //   const { result } = simnet.callPublicFn(
    //     AUCTION_CONTRACT,
    //     "end-auction",
    //     [Cl.uint(0), Cl.contractPrincipal(deployer, "wrong-contract")],
    //     deployer
    //   );
    //   expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    // });

    it("should allow anyone to call end-auction", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      simnet.mineEmptyBlocks(160);

      const { result } = endAuction(0, bidder2);
      expect(result).toBeOk(Cl.bool(true));
    });

    it("should clear winner escrow after auction ends", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      expect(getEscrow(0, bidder1).result).toBeUint(1000000);

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      expect(getEscrow(0, bidder1).result).toBeUint(0);
    });
  });

  // ==========================================================================
  // CANCEL AUCTION TESTS
  // ==========================================================================
  describe("cancel-auction", () => {
    it("should allow seller to cancel with no bids", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      const { result, events } = cancelAuction(0, seller);

      expect(result).toBeOk(Cl.bool(true));

      const nftTransfer = events.find((e) => e.event === "nft_transfer_event");
      expect(nftTransfer!.data.recipient).toBe(seller);
    });

    it("should mark auction as inactive", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      cancelAuction(0, seller);

      const auction = getAuction(0);
      const data = cvToValue(auction.result);
      expect(data.value["active"].value).toBe(false);
    });

    it("should fail when non-seller tries to cancel", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      const { result } = cancelAuction(0, bidder1);
      expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    });

    it("should fail when auction has bids", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      const { result } = cancelAuction(0, seller);
      expect(result).toBeErr(Cl.uint(ERR_NO_BIDS));
    });

    it("should fail when already inactive", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      cancelAuction(0, seller);

      const { result } = cancelAuction(0, seller);
      expect(result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    // it("should fail with wrong NFT contract", () => {
    //   mintNFT(seller);
    //   createAuction(1, 150, 1000000, 0, seller, seller);

    //   const { result } = simnet.callPublicFn(
    //     AUCTION_CONTRACT,
    //     "cancel-auction",
    //     [Cl.uint(0), Cl.contractPrincipal(deployer, "wrong-contract")],
    //     seller
    //   );
    //   expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    // });
  });

  // ==========================================================================
  // READ-ONLY FUNCTION TESTS
  // ==========================================================================
  describe("read-only functions", () => {
    beforeEach(() => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 500, royaltyRecipient, seller);
    });

    describe("get-auction", () => {
      it("should return auction data for valid auction", () => {
        const { result } = getAuction(0);
        expect(result.type).toBe(ClarityType.OptionalSome);
      });

      it("should return none for non-existent auction", () => {
        const { result } = getAuction(999);
        expect(result).toBeNone();
      });
    });

    describe("get-highest-bid", () => {
      it("should return 0 when no bids", () => {
        const { result } = simnet.callReadOnlyFn(
          AUCTION_CONTRACT,
          "get-highest-bid",
          [Cl.uint(0)],
          deployer
        );
        expect(result).toBeSome(Cl.uint(0));
      });

      it("should return current bid amount", () => {
        placeBid(0, 1500000, bidder1);

        const { result } = simnet.callReadOnlyFn(
          AUCTION_CONTRACT,
          "get-highest-bid",
          [Cl.uint(0)],
          deployer
        );
        expect(result).toBeSome(Cl.uint(1500000));
      });

      it("should return none for non-existent auction", () => {
        const { result } = simnet.callReadOnlyFn(
          AUCTION_CONTRACT,
          "get-highest-bid",
          [Cl.uint(999)],
          deployer
        );
        expect(result).toBeNone();
      });
    });

    describe("get-min-bid", () => {
      it("should return reserve price when no bids", () => {
        const { result } = getMinBid(0);
        expect(result).toBeSome(Cl.uint(1000000));
      });

      it("should return current bid + increment after first bid", () => {
        placeBid(0, 1000000, bidder1);
        const { result } = getMinBid(0);
        expect(result).toBeSome(Cl.uint(1050000));
      });

      it("should return none for non-existent auction", () => {
        const { result } = getMinBid(999);
        expect(result).toBeNone();
      });
    });

    describe("get-auction-status", () => {
      it("should return correct status for active auction", () => {
        const { result } = getAuctionStatus(0);
        const status = cvToValue(result);

        expect(status.value["active"].value).toBe(true);
        expect(status.value["ended"].value).toBe(false);
        expect(status.value["has-bids"].value).toBe(false);
      });

      it("should show has-bids as true after bid", () => {
        placeBid(0, 1000000, bidder1);
        const { result } = getAuctionStatus(0);
        const status = cvToValue(result);
        expect(status.value["has-bids"].value).toBe(true);
      });

      it("should show ended as true after expiry", () => {
        simnet.mineEmptyBlocks(160);
        const { result } = getAuctionStatus(0);
        const status = cvToValue(result);

        expect(status.value["ended"].value).toBe(true);
        // expect(Number(status.value.value["blocks-remaining"].value)).toBe(0);
      });

      it("should return none for non-existent auction", () => {
        const { result } = getAuctionStatus(999);
        expect(result).toBeNone();
      });
    });

    describe("get-escrow", () => {
      it("should return 0 for bidder with no escrow", () => {
        const { result } = getEscrow(0, bidder1);
        expect(result).toBeUint(0);
      });

      it("should return escrowed amount for highest bidder", () => {
        placeBid(0, 1500000, bidder1);
        const { result } = getEscrow(0, bidder1);
        expect(result).toBeUint(1500000);
      });

      it("should return 0 for outbid bidder", () => {
        placeBid(0, 1000000, bidder1);
        placeBid(0, 1100000, bidder2);
        const { result } = getEscrow(0, bidder1);
        expect(result).toBeUint(0);
      });
    });
  });

  // ==========================================================================
  // INTEGRATION TESTS
  // ==========================================================================
  describe("integration tests", () => {
    it("should handle complete auction lifecycle with multiple bidders", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 500, royaltyRecipient, seller);

      const sellerInit = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyInit =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;
      const bidder1Init = simnet.getAssetsMap().get("STX")?.get(bidder1) || 0n;
      const bidder2Init = simnet.getAssetsMap().get("STX")?.get(bidder2) || 0n;

      placeBid(0, 1000000, bidder1);
      placeBid(0, 1500000, bidder2);
      placeBid(0, 2000000, bidder1);
      placeBid(0, 3000000, bidder2);

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const sellerFinal = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyFinal =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;
      const bidder1Final = simnet.getAssetsMap().get("STX")?.get(bidder1) || 0n;
      const bidder2Final = simnet.getAssetsMap().get("STX")?.get(bidder2) || 0n;

      expect(royaltyFinal - royaltyInit).toBe(150000n);
      expect(sellerFinal - sellerInit).toBe(2850000n);
      expect(bidder1Final).toBe(bidder1Init);
      expect(bidder2Init - bidder2Final).toBe(3000000n);
    });

    it("should handle multiple concurrent auctions independently", () => {
      mintNFT(seller);
      mintNFT(seller);
      mintNFT(seller);

      createAuction(1, 150, 1000000, 0, seller, seller);
      createAuction(2, 200, 2000000, 0, seller, seller);
      createAuction(3, 250, 3000000, 0, seller, seller);

      placeBid(0, 1000000, bidder1);
      placeBid(1, 2500000, bidder2);
      placeBid(2, 3000000, bidder1);

      simnet.mineEmptyBlocks(160);
      const end0 = endAuction(0, deployer);
      expect(end0.result).toBeOk(Cl.bool(true));

      const status1 = cvToValue(getAuctionStatus(1).result);
      expect(status1.value["active"].value).toBe(true);

      const status2 = cvToValue(getAuctionStatus(2).result);
      expect(status2.value["active"].value).toBe(true);
    });

    it("should handle late bid extension and subsequent winning", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);

      placeBid(0, 1000000, bidder1);

      let auction = getAuction(0);
      const originalEnd = cvToValue(auction.result).value["end-block"].value;

      const blocksToEnd = Number(originalEnd) - simnet.blockHeight - 3;
      simnet.mineEmptyBlocks(blocksToEnd);

      placeBid(0, 1100000, bidder2);

      auction = getAuction(0);
      const newEnd = cvToValue(auction.result).value["end-block"].value;
      expect(Number(newEnd)).toBeGreaterThan(Number(originalEnd));

      simnet.mineEmptyBlocks(15);

      const { result, events } = endAuction(0, deployer);
      expect(result).toBeOk(Cl.bool(true));

      const nftTransfer = events.find((e) => e.event === "nft_transfer_event");
      expect(nftTransfer!.data.recipient).toBe(bidder2);
    });

    it("should handle 10% royalty correctly", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 1000, royaltyRecipient, seller);

      placeBid(0, 5000000, bidder1);

      const sellerBefore = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyBefore =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const sellerAfter = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyAfter =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      expect(royaltyAfter - royaltyBefore).toBe(500000n);
      expect(sellerAfter - sellerBefore).toBe(4500000n);
    });

    it("should emit correct print events", () => {
      mintNFT(seller);

      const createResult = createAuction(1, 150, 1000000, 0, seller, seller);
      const createPrint = createResult.events.find(
        (e) => e.event === "print_event"
      );
      expect(createPrint).toBeDefined();

      const bidResult = placeBid(0, 1000000, bidder1);
      const bidPrint = bidResult.events.find((e) => e.event === "print_event");
      expect(bidPrint).toBeDefined();

      simnet.mineEmptyBlocks(160);
      const endResult = endAuction(0, deployer);
      const endPrint = endResult.events.find((e) => e.event === "print_event");
      expect(endPrint).toBeDefined();
    });
  });

  // ==========================================================================
  // SECURITY TESTS
  // ==========================================================================
  describe("security tests", () => {
    it("should not allow reentrancy through end-auction", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, seller, seller);
      placeBid(0, 1000000, bidder1);

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const bidResult = placeBid(0, 2000000, bidder2);
      expect(bidResult.result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));

      const endResult = endAuction(0, deployer);
      expect(endResult.result).toBeErr(Cl.uint(ERR_AUCTION_NOT_ACTIVE));
    });

    // it("should prevent unauthorized NFT contract usage", () => {
    //   mintNFT(seller);
    //   createAuction(1, 150, 1000000, 0, seller, seller);

    //   simnet.mineEmptyBlocks(160);

    //   const { result } = simnet.callPublicFn(
    //     AUCTION_CONTRACT,
    //     "end-auction",
    //     [Cl.uint(0), Cl.contractPrincipal(bidder1, "malicious-nft")],
    //     deployer
    //   );
    //   expect(result).toBeErr(Cl.uint(ERR_UNAUTHORIZED));
    // });

    it("should handle zero royalty correctly", () => {
      mintNFT(seller);
      createAuction(1, 150, 1000000, 0, royaltyRecipient, seller);

      placeBid(0, 5000000, bidder1);

      const sellerBefore = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyBefore =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      const sellerAfter = simnet.getAssetsMap().get("STX")?.get(seller) || 0n;
      const royaltyAfter =
        simnet.getAssetsMap().get("STX")?.get(royaltyRecipient) || 0n;

      expect(royaltyAfter - royaltyBefore).toBe(0n);
      expect(sellerAfter - sellerBefore).toBe(5000000n);
    });

    it("should properly isolate escrow between auctions", () => {
      mintNFT(seller);
      mintNFT(seller);

      createAuction(1, 150, 1000000, 0, seller, seller);
      createAuction(2, 150, 1000000, 0, seller, seller);

      placeBid(0, 1000000, bidder1);
      placeBid(1, 2000000, bidder1);

      expect(getEscrow(0, bidder1).result).toBeUint(1000000);
      expect(getEscrow(1, bidder1).result).toBeUint(2000000);

      simnet.mineEmptyBlocks(160);
      endAuction(0, deployer);

      expect(getEscrow(0, bidder1).result).toBeUint(0);
      expect(getEscrow(1, bidder1).result).toBeUint(2000000);
    });
  });
});
