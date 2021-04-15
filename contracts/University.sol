// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./AdmissionTokenLib.sol";
import "./BidListLib.sol";

/// @title University with roles
contract University {
  // ---------------------------------------------------------------------------
  // Libraries
  // ---------------------------------------------------------------------------

  using ECDSA for bytes32;
  using AdmissionTokenLib for AdmissionTokenLib.AdmissionToken;
  using BidListLib for BidListLib.BidList;

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
    bytes8[] bids;
  }
  mapping (address => Student) students;

  // struct that handles the admission token balances of students
  AdmissionTokenLib.AdmissionToken tokens;

  // store structs to represent courses
  struct Course {
    bool created;
    uint quota;
    uint8 uoc;
    address[] enrolled;
    BidListLib.BidList bids;
  }
  mapping (bytes8 => Course) courseDetails;
  bytes8[] courses;

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
      'Cannot call this before the contract is initialized'
    );
    _;
  }
  
  /// modifier to confirm that it is chief calling the function
  modifier onlyChief() {
    require(
      msg.sender == chief,
      'Only the chief operating officer may call this'
    );
    _;
  }
  
  /// modfier to confirm that it is a administrator calling the function
  modifier onlyAdmin() {
    require(
      roles[msg.sender] == Role.Admin,
      'Only university administrators may call this'
    );
    _;
  }

  /// modifier to confirm that it is a student calling the function
  modifier onlyStudent() {
    require(
      roles[msg.sender] == Role.Student,
      'Only admitted students may call this'
    );
    _;
  }
  
  /// modifier to confirm that only users that don't already have a role can call the function
  modifier hasNoRole() {
    require(
      roles[msg.sender] == Role.Unknown,
      'Caller already is assigned to a role'
    );
    _;
  }

  /// modifier to confirm that the address being called on is a student
  modifier isStudent(address addr) {
    require(
      roles[addr] == Role.Student,
      'Address provided does not belong to a student'
    );
    _;
  }

  /// modifier to confirm that the course requested exists
  modifier isCourse(bytes8 code) {
    require(
      courseDetails[code].created == true,
      'Requested course code is not recognized'
    );
    _;
  }

  /// modifier to confirm that the course
  modifier isBidder(bytes8 code, address addr) {
    require(
      courseDetails[code].bids.inList(addr),
      'Address called with is had not made a bid for the requested course'
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
    return courses;
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
      'Cannot remove adminstrator role from address that is not an administrator'
    );
    roles[addr] = Role.Unknown;
  }

  /// Allows a user to join the univerity as a student by providing a message
  /// signed by a university administrator
  function enroll(bytes32 hash, bytes memory signature) public hasNoRole {
    require (
      keccak256(abi.encodePacked(address(this), msg.sender)) == hash,
      'Message provided is invalid for this contract'
    );
    require(
      roles[hash.toEthSignedMessageHash().recover(signature)] == Role.Admin,
      'Message is not signed by a university administrator'
    );
    roles[msg.sender] = Role.Student;
  }

  function createCourse(bytes8 code, uint quota, uint8 uoc) public onlyAdmin {
    require(
      courseDetails[code].created == false,
      'A course already exists with that course code'
    );
    require(
      quota > 0,
      'A course must allow at least 1 student'
    );
    require(
      uoc > 0,
      'A course must be worth at least one unit of credit'
    );
    courseDetails[code].quota = quota;
    courseDetails[code].uoc = uoc;
    courseDetails[code].created = true;
    courses.push(code);
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
      tokensHeldInBids += courseDetails[courseCode].bids.getBid(addr);
    }
    return tokens.getBalance(addr) - tokensHeldInBids;
  }

  // ##### STATE CHANGING #####

  /// Allows a student to pay fees for a desired number of units of credit to receive tokens
  function payFees(uint8 numUOC) public payable isInitialized onlyStudent {
    require (
      numUOC + students[msg.sender].paidUOC <= maxUOC,
      'Requested units of credit would cause you to exceed the maximum units of credit for this term'
    );
    require (
      msg.value >= uint(feePerUOC) * numUOC,
      'Not enough Ether to cover the requested units of credit'
    );
    tokens.mint(msg.sender, uint(numUOC) * 100);
    students[msg.sender].paidUOC += numUOC;
  }

  // ---------------------------------------------------------------------------
  // Auction functions
  // ---------------------------------------------------------------------------

  // ##### VIEWS #####
  
  // Allows user to get bid made by a user for a course
  function getBid(bytes8 code, address addr) public view isStudent(addr) isCourse(code) returns (uint) {
    require(
      courseDetails[code].bids.inList(addr),
      'No bid from that address found on the course specified'
    );
    return courseDetails[code].bids.getBid(addr);
  }

  function getBids(bytes8 code) public view isCourse(code) returns (address[] memory, uint[] memory) {
    return courseDetails[code].bids.getBids();
  }

  // ##### STATE CHANGING #####

  function makeBid(bytes8 code, uint amount) public isInitialized onlyStudent isCourse(code) {
    require (
      amount <= getBalance(msg.sender),
      'Not enough admission tokens to make the requested bid'
    );
    uint8 existingBidsUOC = 0;
    for (uint i = 0; i < students[msg.sender].bids.length; i++) {
      bytes8 _code = students[msg.sender].bids[i];
      existingBidsUOC += courseDetails[_code].uoc;
    }
    require (
      existingBidsUOC + courseDetails[code].uoc <= maxUOC,
      'The requested course would put you over the maximum UOC allowed for this session'
    );
    courseDetails[code].bids.insert(msg.sender, amount);
    students[msg.sender].bids.push(code);
  }

  function changeBid(bytes8 code, uint amount) public isInitialized onlyStudent isCourse(code) {
    uint originalBid = courseDetails[code].bids.getBid(msg.sender);
    require(
      amount <= getBalance(msg.sender) + originalBid,
      'Not enough admission tokens to make the requested bid'
    );
    courseDetails[code].bids.change(msg.sender, amount);
  }
}
