// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "./AdmissionTokenLib.sol";

/// @title University with roles
contract University {
  // ---------------------------------------------------------------------------
  // Libraries
  // ---------------------------------------------------------------------------

  using ECDSA for bytes32;
  using AdmissionTokenLib for AdmissionTokenLib.AdmissionToken;

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

  // roles of system users
  enum Role { Unknown, Student, Admin }

  // store the role of all users
  // Unknown by default because of how solidity works with enums
  mapping (address => Role) roles;

  // store structs to represent students
  struct Student {
    uint8 paidUOC;
  }
  mapping (address => Student) students;

  // struct that handles the admission token balances of students
  AdmissionTokenLib.AdmissionToken tokens;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    chief = payable(msg.sender);
  }

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------
  
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

  // modifier to confirm that the address being called on is a student
  modifier isStudent(address addr) {
    require(
      roles[addr] == Role.Student,
      'Address provided does not belong to a student'
    );
    _;
  }

  // ---------------------------------------------------------------------------
  // Administrative Functions
  // ---------------------------------------------------------------------------
  
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

  /// Allows the chief operating officer to change the maximum UOC a student can take
  function setMaxUOC(uint8 _maxUOC) public onlyChief {
    maxUOC = _maxUOC;
  }
  
  /// Allows the chief operating officer to change the fee per UOC
  function setFee(uint248 _feePerUOC) public onlyChief {
    feePerUOC = _feePerUOC;
  }

  /// Convenience function to allow the chief to set the contract configuration in one go
  function init(uint8 _maxUOC, uint248 _feePerUOC) public onlyChief {
    maxUOC = _maxUOC;
    feePerUOC = _feePerUOC;
  }
  
  /// Allows the chief operating officer to withdraw money from the contract
  function withdraw() public onlyChief {
    chief.transfer(address(this).balance); 
  }
  
  /// Allows the chief operating officer to assign a new chief operating officer
  function transferChief(address addr) public onlyChief {
    chief = payable(addr);
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

  /// Allows a student to pay fees for a desired number of units of credit
  function payFees(uint8 numUOC) public payable onlyStudent {
    require (
      numUOC + students[msg.sender].paidUOC <= maxUOC,
      'Requested units of credit would cause you to exceed the maximum units of credit for this term'
    );
    require (
      msg.value == uint(feePerUOC) * numUOC,
      'Not enough Ether to cover the requested units of credit'
    );
    tokens.mint(msg.sender, uint(numUOC) * 100);
    students[msg.sender].paidUOC += numUOC;
  }

  /// Allows user to get the number of UOC paid for by a student
  function getPaidUOC(address addr) public view isStudent(addr) returns (uint8) {
    return students[addr].paidUOC;
  }

  // ---------------------------------------------------------------------------
  // Token functions
  // ---------------------------------------------------------------------------

  /// Allows user to get the token balance of a student
  function getBalance(address addr) public view isStudent(addr) returns (uint) {
    return tokens.getBalance(addr);
  }
}
