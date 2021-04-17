// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./AdmissionTokenLib.sol";
import "./BiddableCoursesLib.sol";

/// @title University with roles
contract University {
  // ---------------------------------------------------------------------------
  // Libraries
  // ---------------------------------------------------------------------------

  using ECDSA for bytes32;
  using AdmissionTokenLib for AdmissionTokenLib.AdmissionToken;
  using BiddableCoursesLib for BiddableCoursesLib.BiddableCourses;

  // ---------------------------------------------------------------------------
  // Contract State
  // ---------------------------------------------------------------------------

  // stores the address of the university's chief operating officer
  // is also the "owner" of the contract
  address payable public chief;

  // full course load
  // limited to a maximum of 255 units of credit
  uint8 public maxUOC;

  // university fee per unit of credit in wei
  // 248 bit fee to ensure that maxUOC x feePerUOC won't overflow in 256 bit uint
  uint248 public feePerUOC;

  // track weather the contract has been initialized by the chief operating officer
  bool public initialized;

  // roles of system users
  enum Role { Unknown, Student, Admin }

  // store the role of all users
  // Unknown by default because of how solidity works with enums
  mapping (address => Role) roles;

  // store structs to represent students
  struct Student {
    uint8 paidUOC;
    bytes8[] acceptedCourses;
    bytes8[] bids;
  }
  mapping (address => Student) students;

  // struct that handles the admission token balances of students
  AdmissionTokenLib.AdmissionToken tokens;

  // struct that handles the courses and bidding
  BiddableCoursesLib.BiddableCourses courses;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    chief = payable(msg.sender);
  }

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------

  /// modifier to confirm that contract has been initialized
  modifier isInitialized() {
    require (
      initialized == true,
      'contract not initialized'
    );
    _;
  }
  
  /// modifier to confirm that it is chief calling the function
  modifier onlyChief() {
    require(
      msg.sender == chief,
      'not chief operating officer'
    );
    _;
  }
  
  /// modfier to confirm that it is a administrator calling the function
  modifier onlyAdmin() {
    require(
      roles[msg.sender] == Role.Admin,
      'not administrator'
    );
    _;
  }

  /// modfier to confirm that it is originall an admin making transaction
  modifier originAdmin() {
    require(
      roles[tx.origin] == Role.Admin,
      'not administrator'
    );
    _;
  }

  /// modifier to confirm that it is a student calling the function
  modifier onlyStudent() {
    require(
      roles[msg.sender] == Role.Student,
      'not student'
    );
    _;
  }
  
  /// modifier to confirm that only users that don't already have a role can call the function
  modifier hasNoRole() {
    require(
      roles[msg.sender] == Role.Unknown,
      'already has role'
    );
    _;
  }

  /// modifier to confirm that the address being called on is a student
  modifier isStudent(address addr) {
    require(
      roles[addr] == Role.Student,
      'not student'
    );
    _;
  }

  /// modifier to confirm that the course requested exists
  modifier isCourse(bytes8 code) {
    require(
      courses.isCourse(code),
      'no such course'
    );
    _;
  }

  modifier biddingIsOpen() {
    require(
      courses.isBiddingOpen() && block.timestamp <= courses.getBiddingEndTime(),
      'bidding closed'
    );
    _;
  }

  // ---------------------------------------------------------------------------
  // Administrative Functions
  // ---------------------------------------------------------------------------

  // ##### VIEWS #####

  /// Returns the role of an address
  function getRole(address addr) public view returns (string memory) {
    if (addr == chief) {
      return 'Chief';
    } else if (roles[addr] == Role.Admin) {
      return 'Admin';
    } else if (roles[addr] == Role.Student) {
      return 'Student';
    } else {
      return 'Unknown';
    }
  }

  /// Allows user to get the number of UOC paid for by a student
  function getPaidUOC(address addr) public view isStudent(addr) returns (uint8) {
    return students[addr].paidUOC;
  }

  /// Allows user to view the courses available in the session
  function getCourses() public view returns (bytes8[] memory) {
    return courses.getCourses();
  }

  /// Allows a user to view the accepted students in a course
  function getAcceptedStudents(bytes8 code) public view returns (address[] memory) {
    return courses.getAccepted(code);
  }

  // ##### STATE CHANGING #####

  /// Convenience function to allow the chief to set the contract configuration in one go
  function init(uint8 _maxUOC, uint248 _feePerUOC) public onlyChief {
    maxUOC = _maxUOC;
    feePerUOC = _feePerUOC;
    initialized = true;
  }

  /// Allows the chief operating officer to assign a new chief operating officer
  function transferChief(address addr) public onlyChief {
    chief = payable(addr);
  }
  
  /// Allows the chief operating officer to withdraw money from the contract
  function withdraw() public onlyChief {
    chief.transfer(address(this).balance); 
  }

  /// Allows the chief operating officer to grant administrator role to addresses
  function addAdmins(address[] memory addresses) public onlyChief {
    for (uint i = 0; i < addresses.length; i++) {
      if (roles[addresses[i]] == Role.Unknown) {
        roles[addresses[i]] = Role.Admin;
      }
    }
  }

  /// Allows the chief operating officer to remove the administrator role to addresses
  function removeAdmin(address addr) public onlyChief {
    require(
      roles[addr] == Role.Admin,
      'not administrator'
    );
    roles[addr] = Role.Unknown;
  }

  /// Allows a user to join the univerity as a student by providing a message
  /// signed by a university administrator
  function enroll(bytes32 hash, bytes memory signature) public hasNoRole {
    require (
      keccak256(abi.encodePacked(address(this), msg.sender)) == hash,
      'invalid hash'
    );
    require(
      roles[hash.toEthSignedMessageHash().recover(signature)] == Role.Admin,
      'invalid signature'
    );
    roles[msg.sender] = Role.Student;
  }

  function createCourse(bytes8 code, uint quota, uint8 uoc) public onlyAdmin {
    courses.createCourse(code, quota, uoc);
  }

  // ---------------------------------------------------------------------------
  // Token functions
  // ---------------------------------------------------------------------------

  // ##### VIEWS #####

  /// Allows user to get the token balance of a student
  function getBalance(address addr) public view isStudent(addr) returns (uint) {
    uint tokensHeldInBids = 0;
    for (uint i = 0; i < students[addr].bids.length; i++) {
      bytes8 courseCode = students[addr].bids[i];
      tokensHeldInBids += courses.getBid(courseCode, addr);
    }
    return tokens.getBalance(addr) - tokensHeldInBids;
  }

  // ##### STATE CHANGING #####

  /// Allows a student to pay fees for a desired number of units of credit to receive tokens
  function payFees(uint8 numUOC) public payable isInitialized onlyStudent {
    require (
      numUOC + students[msg.sender].paidUOC <= maxUOC,
      'exceeding max uoc'
    );
    require (
      msg.value >= uint(feePerUOC) * numUOC,
      'too little ether'
    );
    tokens.mint(msg.sender, uint(numUOC) * 100);
    students[msg.sender].paidUOC += numUOC;
  }

  /// Allows student to receive tokens from another student but must provide 1 tenth of the value of the tokens as a transfer fee
  /// To ensure security the receiver must provide a signed message containing 
  function receiveTransfer(bytes32 hash, bytes memory signature, uint amount, uint nonce) public hasNoRole {
    require(
      keccak256(abi.encodePacked(address(this), msg.sender, amount, nonce)) == hash,
      'invalid hash'
    );
    address signer = hash.toEthSignedMessageHash().recover(signature);
    require(
      roles[signer] == Role.Student,
      'invalid signature'
    );
    require(
      amount <= getBalance(signer),
      'not enough tokens'
    );
    tokens.transfer(signer, msg.sender);
  }

  // ---------------------------------------------------------------------------
  // Auction functions
  // ---------------------------------------------------------------------------

  // ##### VIEWS #####
  
  // Allows user to get bid made by a user for a course
  function getBid(bytes8 code, address addr) public view isStudent(addr) isCourse(code) returns (uint) {
    require(
      courses.bidExists(code, addr),
      'no bid'
    );
    return courses.getBid(code, addr);
  }

  function getBids(bytes8 code) public view isCourse(code) returns (address[] memory, uint[] memory) {
    return courses.getBids(code);
  }

  function getBiddingEndTime() public view returns (uint) {
    return courses.getBiddingEndTime();
  }
  // ##### STATE CHANGING #####

  function startBiddingRound(uint roundTimeInSeconds) public isInitialized onlyAdmin {
    require (
      !courses.isBiddingOpen(),
      'bidding open already'
    );
    courses.openBidding(roundTimeInSeconds);
  }

  function makeBid(bytes8 code, uint amount) public biddingIsOpen onlyStudent isCourse(code) {
    require (
      amount <= getBalance(msg.sender),
      'insufficient tokens'
    );
    uint8 existingUOC = 0;
    for (uint i = 0; i < students[msg.sender].acceptedCourses.length; i++) {
      bytes8 _code = students[msg.sender].acceptedCourses[i];
      existingUOC += courses.getUOC(_code);
    }
    for (uint i = 0; i < students[msg.sender].bids.length; i++) {
      bytes8 _code = students[msg.sender].bids[i];
      existingUOC += courses.getUOC(_code);
    }
    require (
      existingUOC + courses.getUOC(code) <= students[msg.sender].paidUOC,
      'exceeding paid uoc'
    );
    courses.bid(code, msg.sender, amount);
    students[msg.sender].bids.push(code);
  }

  function changeBid(bytes8 code, uint amount) public biddingIsOpen onlyStudent isCourse(code) {
    uint originalBid = courses.getBid(code, msg.sender);
    require(
      amount <= getBalance(msg.sender) + originalBid,
      'insufficient tokens'
    );
    courses.changeBid(code, msg.sender, amount);
  }


  function removeBid(bytes8 code) public biddingIsOpen onlyStudent isCourse(code) {
    courses.removeBid(code, msg.sender);
    bytes8[] storage bids = students[msg.sender].bids;
    for (uint i = 0; i < bids.length; i++) {
      if (bids[i] == code) {
        bids[i] = bids[bids.length - 1];
        bids.pop();
        break;
      }
    }
  }

  function handleAccepted(bytes8 courseCode, address student, uint bidAmount) external originAdmin {
    students[student].acceptedCourses.push(courseCode);
    tokens.burn(student, bidAmount);
    delete students[student].bids;
  }

  function handleRejected(address student) external originAdmin {
    delete students[student].bids;
  }

  function closeBidding() public onlyAdmin() {
    require(
      block.timestamp > courses.getBiddingEndTime(),
      'called too early'
    );
    courses.closeBidding(this.handleAccepted, this.handleRejected);
  }
}
