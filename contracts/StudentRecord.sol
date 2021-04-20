// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.0;

// @title stores the course history of courses passed by students
contract StudentRecord {
  // ---------------------------------------------------------------------------
  // Contract State
  // ---------------------------------------------------------------------------

  // owner of the contract
  address public chief;

  // stores admins that can update the pass state of a student in a course
  mapping(address => bool) admin;

  // stores the courses and who has completed each course
  mapping(bytes8 => mapping(address => bool)) _hasPassed;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  constructor() {
    chief = msg.sender;
  }

  // ---------------------------------------------------------------------------
  // Modifiers
  // ---------------------------------------------------------------------------

  modifier onlyChief() {
    require(
      msg.sender == chief,
      'only the chief may call this'
    );
    _;
  }

  modifier onlyAdmin {
    require(
      admin[msg.sender] == true,
      'only admins may call this'
    );
    _;
  }

  /// Allows the chief to transfer ownership
  function setChief(address addr) public onlyChief {
    chief = addr;
  }

  /// Allows the chief operating officer to grant administrator role to addresses
  function addAdmins(address[] memory addresses) public onlyChief {
    for (uint i = 0; i < addresses.length; i++) {
      admin[addresses[i]] = true;
    }
  }
  
  /// Getter to check if a user has passed a given course
  function hasPassed(bytes8 courseCode, address student) public view returns (bool) {
    return _hasPassed[courseCode][student];
  }
  
  /// Allows admins to pass a student for a course
  function pass(bytes8 courseCode, address student) public onlyAdmin {
    _hasPassed[courseCode][student] = true;
  }
}
