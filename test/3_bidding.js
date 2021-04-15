const { ether, addStudents, assertRole, assertRevert } = require('./helpers.js');
const University = artifacts .require("University");

contract("BidList", accounts => {
  let uni = null;

  before(async () => {
    uni = await University.deployed();
    // maximum 18 UOC, 1 Ether fee per UOC
    await uni.init(18, ether(1), {from: accounts[0]});
    // accounts 1 and 2 will be administrators
    await uni.addAdmins([accounts[1], accounts[2]], {from: accounts[0]});
    // create 5 courses
    await uni.createCourse(web3.utils.fromAscii('COMP6451'), 2, 6, {from: accounts[1]});
    await uni.createCourse(web3.utils.fromAscii('COMP1511'), 4, 6, {from: accounts[1]});
    await uni.createCourse(web3.utils.fromAscii('COMP1521'), 4, 6, {from: accounts[1]});
    await uni.createCourse(web3.utils.fromAscii('COMP9517'), 3, 6, {from: accounts[2]});
    await uni.createCourse(web3.utils.fromAscii('COMP3151'), 2, 6, {from: accounts[2]});
    // accounts 3, 4, 5, 6, 7 will be students
    // accounts 3, 4, 5 will be admitted by account 1
    await addStudents(
      [accounts[3], accounts[4], accounts[5]],
      accounts[1],
      web3.utils.soliditySha3,
      web3.eth.sign,
      uni
    );
    // accounts 6 and 7 will be admitted by account 2
    await addStudents(
      [accounts[6], accounts[7]],
      accounts[2],
      web3.utils.soliditySha3,
      web3.eth.sign,
      uni
    );
    // accounts 3, 4 and 5 will pay for 18 units
    await uni.payFees(18, {from: accounts[3], value: ether(18)});
    await uni.payFees(18, {from: accounts[4], value: ether(18)});
    await uni.payFees(18, {from: accounts[5], value: ether(18)});
    // accounts 6, 7 will pay for 12 units
    await uni.payFees(12, {from: accounts[6], value: ether(12)});
    await uni.payFees(12, {from: accounts[7], value: ether(12)});
  });

  it('should be initialized', async () => {
    // Check init
    await assertRole(accounts[0], 'Chief', uni);
    let maxUOC = await uni.maxUOC();
    await assert.equal(maxUOC, 18, 'maxUOC was not set correctly');
    let fee = await uni.feePerUOC();
    await assert.equal(fee, ether(1), 'fee was not set correctly');
    // Check admins
    await assertRole(accounts[1], 'Admin', uni, 1);
    await assertRole(accounts[2], 'Admin', uni, 2);
    // Check courses
    let courses = (await uni.getCourses()).map(el => web3.utils.hexToAscii(el));
    assert.sameMembers(courses, ['COMP6451', 'COMP1511', 'COMP1521', 'COMP9517', 'COMP3151'],
      'courses were not added correctly');
    // Check students
    await assertRole(accounts[3], 'Student', uni, 3);
    await assertRole(accounts[4], 'Student', uni, 4);
    await assertRole(accounts[5], 'Student', uni, 5);
    await assertRole(accounts[6], 'Student', uni, 6);
    await assertRole(accounts[7], 'Student', uni, 7);
    // Check unknowns
    await assertRole(accounts[8], 'Unknown', uni, 8);
    await assertRole(accounts[9], 'Unknown', uni, 9);
    // Check admission token balances
    assert.equal(await uni.getBalance(accounts[3]), 1800, 'admission tokens not assigned correctly');
    assert.equal(await uni.getBalance(accounts[4]), 1800, 'admission tokens not assigned correctly');
    assert.equal(await uni.getBalance(accounts[5]), 1800, 'admission tokens not assigned correctly');
    assert.equal(await uni.getBalance(accounts[6]), 1200, 'admission tokens not assigned correctly');
    assert.equal(await uni.getBalance(accounts[7]), 1200, 'admission tokens not assigned correctly');
  });

  it('should allow students to bid on courses', async () => {
    // Not student
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP1511'), 500, {from: accounts[8]});
    }, 'calling with non-student should throw exception');
    // No course with requested code
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP1234'), 500, {from: accounts[3]});
    }, 'calling with course that does not exist should throw exception');
    // Not enough admission tokens
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP1511'), 1801, {from: accounts[3]});
    }, 'bidding more tokens than they have should throw exception');
    // Valid bid of 500 tokens out of 1800 possible
    try {
      await uni.makeBid(web3.utils.fromAscii('COMP1511'), 500, {from: accounts[3]});
      let bid = await uni.getBid(web3.utils.fromAscii('COMP1511'), accounts[3]);
      assert.equal(bid, 500, 'bid was not recorded correctly')
    } catch (err) {
      console.log(err);
      assert.fail('valid bid threw exception');
    }
    // Trying to make a new bid for the same course
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP1511'), 500, {from: accounts[3]});
    }, 'should not allow student to make two separate bids for the same course');
    // Another valid bid of 1000 tokens out of 1300 possible
    try {
      await uni.makeBid(web3.utils.fromAscii('COMP6451'), 1000, {from: accounts[3]});
      let bid = await uni.getBid(web3.utils.fromAscii('COMP6451'), accounts[3]);
      assert.equal(bid, 1000, 'bid was not recorded correctly')
    } catch (err) {
      console.log(err);
      assert.fail('valid bid threw exception');
    }
    // Trying to make bid for more tokens than the 300 tokens they have left
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP3151'), 301, {from: accounts[3]});
    }, 'bid for more tokens than they have should have thrown exception');
    // Another valid bid of 200 tokens
    try {
      await uni.makeBid(web3.utils.fromAscii('COMP3151'), 200, {from: accounts[3]});
      let bid = await uni.getBid(web3.utils.fromAscii('COMP3151'), accounts[3]);
      assert.equal(bid, 200, 'bid was not recorded correctly')
    } catch (err) {
      console.log(err);
      assert.fail('valid bid threw exception');
    }
    // Trying to bid remaining 100 tokens on a fourth course that would exceed the max UOC
    await assertRevert(async () => {
      await uni.makeBid(web3.utils.fromAscii('COMP1521'), 100, {from: accounts[3]});
    }, 'should not be able to bid on more courses that would exceed max UOC');
  });

  it('should allow users to view the bids made on a course ordered by bid', async () => {
    await uni.makeBid(web3.utils.fromAscii('COMP6451'), 800, {from: accounts[4]});
    await uni.makeBid(web3.utils.fromAscii('COMP6451'), 1050, {from: accounts[5]});
    let ret = await uni.getBids(web3.utils.fromAscii('COMP6451'));
    let addresses = ret[0];
    let bids = ret[1].map(el => el.toNumber());
    assert.sameOrderedMembers(addresses, [accounts[5], accounts[3], accounts[4]],
      'bidders are not in the right order');
    assert.sameOrderedMembers(bids, [1050, 1000, 800]);
  });

  it('should allow users to change their bid', async () => {
    await uni.changeBid(web3.utils.fromAscii('COMP6451'), 1100, {from: accounts[3]});
    let ret = await uni.getBids(web3.utils.fromAscii('COMP6451'));
    let addresses = ret[0];
    let bids = ret[1].map(el => el.toNumber());
    assert.sameOrderedMembers(addresses, [accounts[3], accounts[5], accounts[4]],
      'bidders are not in the right order');
    assert.sameOrderedMembers(bids, [1100, 1050, 800]);
  });
});
