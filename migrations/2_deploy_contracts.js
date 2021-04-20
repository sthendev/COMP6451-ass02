const StudentRecord = artifacts.require("StudentRecord");
const AdmissionTokenLib = artifacts.require("AdmissionTokenLib");
const BidListLib = artifacts.require("BidListLib");
const BiddableCoursesLib = artifacts.require("BiddableCoursesLib");
const University = artifacts.require("University");

module.exports = function(deployer) {
  deployer.deploy(AdmissionTokenLib);
  deployer.link(AdmissionTokenLib, University);
  deployer.deploy(BidListLib)
  deployer.link(BidListLib, BiddableCoursesLib);
  deployer.deploy(BiddableCoursesLib);
  deployer.link(BiddableCoursesLib, University);
  deployer.deploy(StudentRecord).then(sturec => {
    return deployer.deploy(University, sturec.address);
  })
};
