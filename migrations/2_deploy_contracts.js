const University = artifacts.require("University");

module.exports = function(deployer) {
  deployer.deploy(University);
};
