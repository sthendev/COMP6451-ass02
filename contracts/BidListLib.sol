// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library BidListLib {

  struct Bid {
    bool inList;
    uint amount;
    address next;
  }
  
  struct BidList {
    address head;
    uint160 length;
    mapping (address => Bid) bids;
  }
  
  // ##### VIEWS #####

  /// Checks if a bidder has already placed a bid in this list
  function inList(BidList storage self, address bidder) internal view returns (bool) {
    return self.bids[bidder].inList;
  }

  /// Allow users to retrieve the bid that a particular user made in this list
  function getBid(BidList storage self, address addr) internal view returns(uint) {
    return self.bids[addr].amount;
  }

  /// Return an ordered list of bids
  function getBids(BidList storage self) internal view returns (address[] memory, uint[] memory) {
    address[] memory bidders = new address[](self.length);
    uint[] memory bids = new uint[](self.length);
    address curr = self.head;
    uint i = 0;
    while (curr != address(0) && i < self.length) {
      bidders[i] = curr;
      bids[i] = self.bids[curr].amount;
      curr = self.bids[curr].next;
      i++;
    }
    return (bidders, bids);
  }

  // ##### STATE CHANGING ######

  function insert(BidList storage self, address bidder, uint amount) internal {
    require(
      inList(self, bidder) == false,
      'Bidder has already made a bid for this'
    );
    if (self.head == address(0) || amount > self.bids[self.head].amount) {
      self.bids[bidder].next = self.head;
      self.head = bidder;
    } else {
      address curr = self.head;
      address next = self.bids[curr].next;
      while (next != address(0) && amount <= self.bids[next].amount) {
        curr = next;
        next = self.bids[curr].next;
      }
      self.bids[bidder].next = next;
      self.bids[curr].next = bidder;
    }
    self.bids[bidder].inList = true;
    self.bids[bidder].amount = amount;
    self.length++;
  }

  function remove(BidList storage self, address bidder) internal {
    if (self.head == address(0)) return;
    address curr = self.head;
    address next = self.bids[curr].next;
    while (next != address(0) && next != bidder) {
      curr = next;
      next = self.bids[curr].next;
    }
    if (next != address(0)) {
      self.bids[curr].next = self.bids[next].next;
      self.bids[next].amount = 0;
      self.bids[next].next = address(0);
      self.bids[next].inList = false;
      self.length--;
    }
  }

  function change(BidList storage self, address bidder, uint amount) internal {
    require(
      inList(self, bidder) == true,
      'Cannot change bid that does not exist'
    );
    remove(self, bidder);
    insert(self, bidder, amount);
  }
}
