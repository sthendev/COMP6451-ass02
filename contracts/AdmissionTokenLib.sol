// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library AdmissionTokenLib {

  struct AdmissionToken {
    mapping (address => uint) balances;
  }
  
  // ##### VIEWS #####
  
  // Returns the admission token balance of an address
  function getBalance(AdmissionToken storage self, address addr) public view returns(uint) {
    return self.balances[addr];
  }
  
  // ##### STATE CHANGING #####
  
  /// Assigns newly created tokens to an address
  function mint(AdmissionToken storage self, address to, uint amount) public {
    self.balances[to] += amount;
  }

  /// Burns an amount of tokens owned by a user
  function burn(AdmissionToken storage self, address from, uint amount) public {
    require(
      amount <= self.balances[from],
      'cannot burn more tokens that the user has'
    );
    self.balances[from] -= amount;
  }
}
