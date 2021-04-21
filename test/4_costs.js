const University = artifacts.require("University");
const StudentRecord = artifacts.require("StudentRecord");
const { ether, fixSignature } = require('./helpers');

function printDiffReturn(original, afterCall, message) {
  if (message.length > 15) throw `message too long: ${message}`;
  let etherCost = BigInt(original) - BigInt(afterCall)
  // divide by 100 gwei which is default gas price for truffle
  let gasCost = etherCost / BigInt('100000000000')
  console.log(message.padEnd(15, ' '), gasCost.toString());
  return BigInt(afterCall);
}

contract("Costs", accounts => {
  it('should print out all the costs', async () => {
    uni = await University.deployed();
    sturec = await StudentRecord.deployed();
    
    let chief = accounts[0];
    let chiefBalance = printDiffReturn(
      ether(100),
      await web3.eth.getBalance(chief), 
      'Deployment:'
    );
    
    let admin = accounts[1];
    await uni.addAdmins([admin], {from: chief});
    await sturec.addAdmins([admin], {from: chief});

    chiefBalance = printDiffReturn(
      chiefBalance,
      await web3.eth.getBalance(chief),
      'Add Admin:'
    );

    let lecturer = accounts[2];
    await uni.addLecturer(lecturer, {from: admin});

    let adminBalance = printDiffReturn(
      ether(100),
      await web3.eth.getBalance(admin),
      'Add Lecturer:'
    );

    await uni.init(18, 1000, {from: chief});

    chiefBalance = printDiffReturn(
      chiefBalance,
      await web3.eth.getBalance(chief),
      'Init Contract:'
    );

    let courseBytes8 = web3.utils.fromAscii('COMP4212')
    await uni.createCourse(
      courseBytes8, 3, 6, lecturer, 
      [], {from: admin}
    );

    adminBalance = printDiffReturn(
      adminBalance,
      await web3.eth.getBalance(admin),
      'Create Course:'
    );
    
    let student = accounts[3];
    let hash = web3.utils.soliditySha3(uni.address, student);
    let signature =  fixSignature(await web3.eth.sign(hash, admin));
    await uni.enroll(hash, signature, {from: student});
    await uni.payFees(18, {from: student, value: 18000});

    adminBalance = printDiffReturn(
      adminBalance,
      await web3.eth.getBalance(admin),
      'Enrol Student:'
    );

    await sturec.pass(courseBytes8, student, {from: admin});

    adminBalance = printDiffReturn(
      adminBalance,
      await web3.eth.getBalance(admin),
      'Pass Student:'
    );

    await uni.startBiddingRound(5, {from: admin});
    let biddingEnd = (await uni.getBiddingEndTime()).toNumber();

    adminBalance = printDiffReturn(
      adminBalance,
      await web3.eth.getBalance(admin),
      'Start Round:'
    );

    await uni.makeBid(courseBytes8, 800,  {from: student});
    while (Math.floor(Date.now() / 1000) <= biddingEnd + 2) {
      await new Promise(r => setTimeout(r, 1000));
    }
    await uni.closeBidding({from: admin});
    
    adminBalance = printDiffReturn(
      adminBalance,
      await web3.eth.getBalance(admin),
      'End Round:'
    );
  });
});

