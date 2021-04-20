const University = artifacts.require("University");
const StudentRecord = artifacts.require("StudentRecord");

// Taken from @openzeppelin/test/helpers/sign.js to make web3.eth.sign compatible
// with ECDSA.recover from openzeppelin which we use within contract
function fixSignature (signature) {
  // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
  // signature malleability if version is 0/1
  // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
  let v = parseInt(signature.slice(130, 132), 16);
  if (v < 27) {
    v += 27;
  }
  const vHex = v.toString(16);
  return signature.slice(0, 130) + vHex;
}

// helper function for testing reverts
async function assertRevert(testFunc, message) {
  try {
    await testFunc();
    throw null;
  } catch (err) {
    assert.notEqual(err, null, message);
  }
}

contract("Test Scenario 4: Assessing Stretch Goals", accounts => {
  let uni = null;
  let sturec = null;
  let chief = undefined;
  let admin = undefined;
  let studentA = undefined;
  let studentB = undefined;
  let studentC = undefined;
  let studentD = undefined;
  let studentE = undefined;
  let lecturer6451 = undefined;

  it('should perform initial setup with lecturers an prerequisites', async () => {
    // Univerity is deployed with StudentRecord passed as argument to contructor
    uni = await University.deployed();
    sturec = await StudentRecord.deployed();

    // account[0] is chief by default
    assert.equal(await uni.getRole(accounts[0]), 'Chief', 'account[0] is not chief');
    chief = accounts[0];

    // assign account[1] as admin
    await uni.addAdmins([accounts[1]], {from: chief});
    await sturec.addAdmins([accounts[1]], {from: chief});
    assert.equal(await uni.getRole(accounts[1]), 'Admin', 'account[1] is not admin');
    admin = accounts[1];

    // assign account[2] as lecturer
    await uni.addLecturer(accounts[2], {from: admin});
    assert.equal(await uni.getRole(accounts[2]), 'Lecturer', 'account[2] is not lecturer');
    lecturer6451 = accounts[2];

    // assign account[8] as lecturer
    await uni.addLecturer(accounts[8], {from: admin});
    assert.equal(await uni.getRole(accounts[8]), 'Lecturer', 'account[8] is not lecturer');
    lecturer4212 = accounts[8];

    // assign account[9] as lecturer
    await uni.addLecturer(accounts[9], {from: admin});
    assert.equal(await uni.getRole(accounts[9]), 'Lecturer', 'account[9] is not lecturer');
    lecturer3441 = accounts[9];

    // chief sets fees at 1000 wei per UOC, also sets max UOC for this session to 18
    await uni.init(18, 1000, {from: chief});
    assert.equal(await uni.feePerUOC(), 1000, 'fee per UOC was not set to 1000 wei');
    assert.equal(await uni.maxUOC(), 18, 'max UOC was not set to 18 UOC');

    // admin setup up 3 courses
    // --> COMP6451(6 UOC, quota 2) no prerequisites
    await uni.createCourse(
      web3.utils.fromAscii('COMP6451'), 2, 6, lecturer6451, [], {from: admin}
    );

    // --> COMP4212(6 UOC, quota 3) COMP3441 is a prerequisite
    await uni.createCourse(
      web3.utils.fromAscii('COMP4212'), 3, 6, lecturer4212, 
      [web3.utils.fromAscii('COMP3441')], {from: admin}
    );

    // --> COMP3441(6 UOC, quota 2) no prerequisites
    await uni.createCourse(
      web3.utils.fromAscii('COMP3441'), 2, 6, lecturer3441, [], {from: admin}
    );

    let courses = (await uni.getCourses()).map(bytes => web3.utils.hexToAscii(bytes));
    assert.sameMembers(courses, ['COMP6451', 'COMP4212', 'COMP3441']);

    // admin admits 5 students (accounts[3] -> accounts[7]), each student pays for 18 UOC
    for (let i = 3; i <= 7; i++) {
      // students enroll themselves by supplying a signed message from an admin
      let hash = web3.utils.soliditySha3(uni.address, accounts[i]);
      let signature =  fixSignature(await web3.eth.sign(hash, admin));
      await uni.enroll(hash, signature, {from: accounts[i]});
      assert.equal(await uni.getRole(accounts[i]), 'Student', `account[${i}] is not student`);
      
      // students pay for 18 UOC
      await uni.payFees(18, {from: accounts[i], value: 18000});
    }

    // save students for future tests
    studentA = accounts[3];
    studentB = accounts[4];
    studentC = accounts[5];
    studentD = accounts[6];
    studentE = accounts[7];

    // record that students B and E have completed COMP3441
    let courseBytes8 = web3.utils.fromAscii('COMP3441');
    await sturec.pass(courseBytes8, studentB, {from: admin});
    assert.equal(await sturec.hasPassed(courseBytes8, studentB), true, 'failed to record student B passed COMP3441');
    await sturec.pass(courseBytes8, studentE, {from: admin});
    assert.equal(await sturec.hasPassed(courseBytes8, studentE), true, 'failed to record student E passed COMP3441');
  });

  it('should handle round 1 with prerequisites', async () => {
    // admin starts a 5 second bidding round
    await uni.startBiddingRound(5, {from: admin});
    let biddingEnd = (await uni.getBiddingEndTime()).toNumber();

    // students A, B and E bid for COMP4212
    let courseBytes8 = web3.utils.fromAscii('COMP4212');
    await assertRevert(async () => {
      await uni.makeBid(courseBytes8, 600, {from: studentA});
    }, 'student A does not meet prerequisites so should revert');
    await uni.makeBid(courseBytes8, 800,  {from: studentB});
    await uni.makeBid(courseBytes8, 1000,  {from: studentE});
    // students B and E have valid bids
    assert.equal(await uni.getBid(courseBytes8, studentB), 800, 'student B bid was no recorded');
    assert.equal(await uni.getBid(courseBytes8, studentE), 1000, 'student E bid was no recorded');
    
    // student A resubmits with signed message from lecturer
    let hash = web3.utils.soliditySha3(uni.address, studentA, courseBytes8);
    let signature = fixSignature(await web3.eth.sign(hash, lecturer4212));
    await uni.makeBidWithSignature(courseBytes8, 600, hash, signature, {from: studentA});
    assert.equal(await uni.getBid(courseBytes8, studentA), 600, 'student A resubmission with signature failed');

    // student C submits with self signed message
    await assertRevert(async () => {
      let hash = web3.utils.soliditySha3(uni.address, studentC, courseBytes8);
      let signature = fixSignature(await web3.eth.sign(hash, studentC));
      await uni.makeBidWithSignature(courseBytes8, 600, hash, signature, {from: studentC});
    }, 'making bid with self signed signature should revert');

    // wait for round to close, wait 2 more seconds for good measure
    while (Math.floor(Date.now() / 1000) <= biddingEnd + 2) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // admin closes bidding round
    await uni.closeBidding({from: admin});

    // check only student A, B and E were accepted
    let accepted = await uni.getAcceptedStudents(courseBytes8);
    assert.sameMembers(accepted, [studentA, studentB, studentE], 'incorrect students accepted to COMP6451');

    // check ending balances
    assert.equal(await uni.getBalance(studentA), 1200, `studentA does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentB), 1000, `studentB does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentC), 1800, `studentC does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentD), 1800, `studentD does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentE), 800, `studentE does not have the right number of tokens at end`);
  });
});
