// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./BidListLib.sol";

/// @title University courese with bidding
library BiddableCoursesLib {
  using BidListLib for BidListLib.BidList;

  // store structs to represent courses
  struct BiddableCourse {
    bool created;
    uint quota;
    uint8 uoc;
    address[] accepted;
    address lecturer;
    bytes8[] prereqs;
    BidListLib.BidList bids;
  }
  
  struct BiddableCourses {
    mapping (bytes8 => BiddableCourse) courseDetails;
    bytes8[] courses;
    // State related to bidding rounds
    bool biddingOpen;
    uint biddingEndTime;
  }

  // ##### VIEWS ######

  function isCourse(BiddableCourses storage self, bytes8 code) public view returns(bool) {
    return self.courseDetails[code].created;
  }

  function isBiddingOpen(BiddableCourses storage self) public view returns(bool) {
    return self.biddingOpen;
  }

  function getBiddingEndTime(BiddableCourses storage self) public view returns(uint) {
    return self.biddingEndTime;
  }

  function getCourses(BiddableCourses storage self) public view returns(bytes8[] memory) {
    return self.courses;
  }

  function getBid(
    BiddableCourses storage self,
    bytes8 code,
    address bidder
  ) public view returns(uint) {
    return self.courseDetails[code].bids.getBid(bidder);
  }

  function getBids(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(address[] memory, uint[] memory) {
    return self.courseDetails[code].bids.getBids();
  }

  function bidExists(
    BiddableCourses storage self,
    bytes8 code,
    address bidder
  ) public view returns(bool) {
    return self.courseDetails[code].bids.inList(bidder);
  }

  function getUOC(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(uint8) {
    return self.courseDetails[code].uoc;
  }
  
  function getQuota(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(uint) {
    return self.courseDetails[code].quota;
  }

  function getAccepted(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(address[] memory) {
    return self.courseDetails[code].accepted;
  }

  function getLecturer(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(address) {
    return self.courseDetails[code].lecturer;
  }

  function getPrerequisites(
    BiddableCourses storage self,
    bytes8 code
  ) public view returns(bytes8[] memory, uint length) {
    return (self.courseDetails[code].prereqs, self.courseDetails[code].prereqs.length);
  }

  // ##### STATE CHANGING #####
  
  function createCourse(
    BiddableCourses storage self,
    bytes8 code,
    uint quota,
    uint8 uoc,
    address lecturer,
    bytes8[] memory prereqs
  ) public {
    require(
      self.courseDetails[code].created == false,
      'duplicate course'
    );
    require(
      quota > 0,
      'invalid quota'
    );
    require(
      uoc > 0,
      'invalid uoc'
    );
    self.courseDetails[code].quota = quota;
    self.courseDetails[code].uoc = uoc;
    self.courseDetails[code].created = true;
    self.courseDetails[code].lecturer = lecturer;
    self.courseDetails[code].prereqs = prereqs;
    self.courses.push(code);
  }

  function openBidding(
    BiddableCourses storage self,
    uint roundTimeInSeconds
  ) public {
    self.biddingOpen = true;
    self.biddingEndTime = block.timestamp + roundTimeInSeconds;
  }

  function bid(
    BiddableCourses storage self,
    bytes8 code,
    address bidder,
    uint amount
  ) public {
    self.courseDetails[code].bids.insert(bidder, amount);
  }

  function changeBid(
    BiddableCourses storage self,
    bytes8 code,
    address bidder,
    uint amount
  ) public {
    self.courseDetails[code].bids.change(bidder, amount);
  }

  function removeBid(
    BiddableCourses storage self,
    bytes8 code,
    address bidder
  ) public {
    self.courseDetails[code].bids.remove(bidder);
  }

  function closeBidding(
    BiddableCourses storage self,
    function (bytes8, address, uint) external handleAccepted,
    function (address) external handleRejected
  ) public {
    for (uint i = 0; i < self.courses.length; i++) {
      bytes8 course = self.courses[i];
      uint spotsRemaining = self.courseDetails[course].quota - self.courseDetails[course].accepted.length;
      BidListLib.BidList storage bidList = self.courseDetails[course].bids;
      address curr = bidList.head;
      while (curr != address(0)) {
        if (spotsRemaining > 0) {
          self.courseDetails[course].accepted.push(curr);
          handleAccepted(course, curr, self.courseDetails[course].bids.getBid(curr));
          spotsRemaining--;
        } else {
          handleRejected(curr);
        }
        address next = bidList.bids[curr].next;
        bidList.bids[curr].inList = false;
        bidList.bids[curr].amount = 0;
        bidList.bids[curr].next = address(0);
        bidList.length--;
        curr = next;
      }
      bidList.head = address(0);
    }
    self.biddingOpen = false;
  }
}

