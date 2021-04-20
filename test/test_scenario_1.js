const University = artifacts.require("University");

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

contract("Test Scenario 1: Student Enrolment based on Bids", accounts => {
  let uni = null;
  let chief = undefined;
  let admin = undefined;
  let studentA = undefined;
  let studentB = undefined;
  let studentC = undefined;
  let studentD = undefined;
  let studentE = undefined;

  it('should perform initial setup', async () => {
    uni = await University.deployed();
    // account[0] is chief by default
    assert.equal(await uni.getRole(accounts[0]), 'Chief', 'account[0] is not chief');
    chief = accounts[0];

    // assign account[1] as admin
    await uni.addAdmins([accounts[1]], {from: chief});
    assert.equal(await uni.getRole(accounts[1]), 'Admin', 'account[1] is not admin');
    admin = accounts[1];

    // assign account[2] as lecturer
    await uni.addLecturer(accounts[2], {from: admin});
    assert.equal(await uni.getRole(accounts[2]), 'Lecturer', 'account[2] is not lecturer');
    let lecturer = accounts[2];

    // chief sets fees at 1000 wei per UOC, also sets max UOC for this session to 18
    await uni.init(18, 1000, {from: chief});
    assert.equal(await uni.feePerUOC(), 1000, 'fee per UOC was not set to 1000 wei');
    assert.equal(await uni.maxUOC(), 18, 'max UOC was not set to 18 UOC');

    // admin setup up 3 courses
    // --> COMP6451(6 UOC, quota 2) no prerequisites
    await uni.createCourse(
      web3.utils.fromAscii('COMP6451'), 2, 6, lecturer, [], {from: admin}
    );

    // --> COMP4212(6 UOC, quota 3) no prerequisites
    await uni.createCourse(
      web3.utils.fromAscii('COMP4212'), 3, 6, lecturer, [], {from: admin}
    );

    // --> COMP3441(6 UOC, quota 2) no prerequisites
    await uni.createCourse(
      web3.utils.fromAscii('COMP3441'), 2, 6, lecturer, [], {from: admin}
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
    studentA = accounts[3];
    studentB = accounts[4];
    studentC = accounts[5];
    studentD = accounts[6];
    studentE = accounts[7];
  });

  it('should handle round 1', async () => {
    // univserity system should have 90000 wei balance
    assert.equal(await web3.eth.getBalance(uni.address), 90000, 'system does not have 90000 wei');

    // admin starts a 5 second bidding round
    await uni.startBiddingRound(5, {from: admin});
    let biddingEnd = (await uni.getBiddingEndTime()).toNumber();

    // all students have 1800 course admission tokens
    assert.equal(await uni.getBalance(studentA), 1800, `studentA does not have the right number of tokens`);
    assert.equal(await uni.getBalance(studentB), 1800, `studentB does not have the right number of tokens`);
    assert.equal(await uni.getBalance(studentC), 1800, `studentC does not have the right number of tokens`);
    assert.equal(await uni.getBalance(studentD), 1800, `studentD does not have the right number of tokens`);
    assert.equal(await uni.getBalance(studentE), 1800, `studentE does not have the right number of tokens`);

    // all students bid for COMP6451
    let courseBytes8 = web3.utils.fromAscii('COMP6451');
    await uni.makeBid(courseBytes8, 1200, {from: studentA});
    await uni.makeBid(courseBytes8, 800,  {from: studentB});
    await uni.makeBid(courseBytes8, 1000, {from: studentC});
    await uni.makeBid(courseBytes8, 600,  {from: studentD});
    await uni.makeBid(courseBytes8, 600,  {from: studentE});

    // wait for round to close, wait 2 more seconds for good measure
    while (Math.floor(Date.now() / 1000) <= biddingEnd + 2) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // admin closes bidding round
    await uni.closeBidding({from: admin});

    // check only student A and student C were accepted
    let accepted = await uni.getAcceptedStudents(courseBytes8);
    assert.sameMembers(accepted, [studentA, studentC], 'incorrect students accepted to COMP6451');

    // check ending balances
    assert.equal(await uni.getBalance(studentA), 600, `studentA does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentB), 1800, `studentB does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentC), 800, `studentC does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentD), 1800, `studentD does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentE), 1800, `studentE does not have the right number of tokens at end`);
  });
});
