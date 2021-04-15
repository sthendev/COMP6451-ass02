// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library AdmissionTokenLib {

  struct AdmissionToken {
    mapping (address => uint) balances;
  }
  
  // ##### VIEWS #####
  
  // Returns the admission token balance of an address
  function getBalance(AdmissionToken storage self, address addr) internal view returns(uint) {
    return self.balances[addr];
  }
  
  // ##### STATE CHANGING #####
  
  /// Assigns newly createdd tokens to an address
  function mint(AdmissionToken storage self, address to, uint amount) internal {
    self.balances[to] += amount;
  }
}
