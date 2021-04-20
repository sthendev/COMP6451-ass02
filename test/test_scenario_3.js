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

contract("Test Scenario 3: Exchangin Tokens and Changing Bids", accounts => {
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

    // save students for future tests
    studentA = accounts[3];
    studentB = accounts[4];
    studentC = accounts[5];
    studentD = accounts[6];
    studentE = accounts[7];
  });

  it('should handle round 1 with transfer of tokens and changing of bid', async () => {
    // admin starts a 5 second bidding round
    await uni.startBiddingRound(5, {from: admin});
    let biddingEnd = (await uni.getBiddingEndTime()).toNumber();

    // bids COMP6451: A->1600, C->1800, E->1600
    let course6451Bytes8 = web3.utils.fromAscii('COMP6451');
    await uni.makeBid(course6451Bytes8, 1600, {from: studentA});
    await uni.makeBid(course6451Bytes8, 1800, {from: studentC});
    await uni.makeBid(course6451Bytes8, 1600,  {from: studentE});

    // bids COMP3441: A->200, B->100, D->200
    let course3441Bytes8 = web3.utils.fromAscii('COMP3441');
    await uni.makeBid(course3441Bytes8, 200, {from: studentA});
    await uni.makeBid(course3441Bytes8, 100,  {from: studentB});
    await uni.makeBid(course3441Bytes8, 200,  {from: studentD});


    // student D sells student A 200 tokens
    let hash = web3.utils.soliditySha3(uni.address, studentA, 200, 1);
    let signature = fixSignature(await web3.eth.sign(hash, studentD));
    await uni.receiveTransfer(hash, signature, 200, 1, {from: studentA, value: 200});

    // check that the uni has received the transfer fee
    assert.equal(await web3.eth.getBalance(uni.address), 90200, 'transaction fee unsuccessfully paid');

    // student A increses bid COMP6451 to 1800
    await uni.changeBid(course6451Bytes8, 1800, {from: studentA});

    // wait for round to close, wait 2 more seconds for good measure
    while (Math.floor(Date.now() / 1000) <= biddingEnd + 2) {
      await new Promise(r => setTimeout(r, 1000));
    }

    // admin closes bidding round
    await uni.closeBidding({from: admin});

    // check only student A and student C were accepted to COMP6451
    let accepted6451 = await uni.getAcceptedStudents(course6451Bytes8);
    assert.sameMembers(accepted6451, [studentA, studentC], 'incorrect students accepted to COMP6451');

    // check only student A and student D where accepted to COMP3441
    let accepted3441 = await uni.getAcceptedStudents(course3441Bytes8);
    assert.sameMembers(accepted3441, [studentA, studentD], 'incorrect students accepted to COMP3441');

    // check ending balances
    assert.equal(await uni.getBalance(studentA), 0, `studentA does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentB), 1800, `studentB does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentC), 0, `studentC does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentD), 1400, `studentD does not have the right number of tokens at end`);
    assert.equal(await uni.getBalance(studentE), 1800, `studentE does not have the right number of tokens at end`);
  });
});
