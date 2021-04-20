const { ether, addStudents, assertRole, assertRevert, fixSignature } = require('./helpers.js');
const University = artifacts.require("University");

contract("AdmissionToken", accounts => {
  let uni = null;

  it('should not allow students to pay fees before the contract is initialized', async () => {
    uni = await University.deployed();
    // accounts 1 and 2 will be administrators
    await uni.addAdmins([accounts[1], accounts[2]], {from: accounts[0]});
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
    // test if student is allowed to pay fees before init called by chief
    await assertRevert(async () => {
      await uni.payFees(12, {from: accounts[3], value: ether(12)});
    }, 'student was able to pay fees before initialization');
    // maximum 18 UOC, 1 Ether fee per UOC
    await uni.init(18, ether(1), {from: accounts[0]});
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
    // Check students
    await assertRole(accounts[3], 'Student', uni, 3);
    await assertRole(accounts[4], 'Student', uni, 4);
    await assertRole(accounts[5], 'Student', uni, 5);
    await assertRole(accounts[6], 'Student', uni, 6);
    await assertRole(accounts[7], 'Student', uni, 7);
    // Check unknowns
    await assertRole(accounts[8], 'Unknown', uni, 8);
    await assertRole(accounts[9], 'Unknown', uni, 9);
  });

  it('should allow student to pay fees for n units of credit and be assigned tokens', async () => {
    // Invalid Access
    await assertRevert(async () => {
      await uni.payFees(18, {from: accounts[8], value: ether(18)});
    }, 'calling payFees from Unknown address did not throw exception');
    // Too many UOC requested
    await assertRevert(async () => {
      await uni.payFees(19, {from: accounts[3], value: ether(18)});
    }, 'calling payFees with too many UOC did not throw exception')
    // Not enough ether provided
    await assertRevert(async () => {
      await uni.payFees(12, {from: accounts[3], value: ether(12, -1)});
    }, 'calling payFees with not enough ether did not throw exception')
    // Valid payment of fees for 12 units of credit
    try {
      await uni.payFees(12, {from: accounts[3], value: ether(12)});
      let paidUOC = await uni.getPaidUOC(accounts[3]);
      assert.equal(paidUOC, 12, 'student paidUOC was not updated correctly');
      let tokenBalance = await uni.getBalance(accounts[3]);
      assert.equal(tokenBalance, 1200, 'student balance was not updated correctly');
    } catch (err) {
      console.log(err);
      assert.fail('valid payment for 12 UOC threw exception');
    }
    // Invalid repayment for 7 UOC making total for student greater than 18 UOC maximum
    await assertRevert(async () => {
      await uni.payFees(7, {from: accounts[3], value: ether(7)});
    }, 'calling payFees again to exceed max UOC did not throw exception');
    // Valid repayment for 6 UOC bringing total paid equal to 18 UOC maximum
    try {
      await uni.payFees(6, {from: accounts[3], value: ether(6)});
      let paidUOC = await uni.getPaidUOC(accounts[3]);
      assert.equal(paidUOC, 18, 'student paidUOC was not updated correctly');
      let tokenBalance = await uni.getBalance(accounts[3]);
      assert.equal(tokenBalance, 1800, 'student balance was not updated correctly');
    } catch (err) {
      console.log(err);
      assert.fail('valid repayment for 6 UOC threw exception');
    }
  });

  it('should allow students to transfer funds between each other', async () => {
    const buyer = accounts[4];
    const seller = accounts[3];
    const initialBuyerTokens = (await uni.getBalance(buyer)).toNumber();
    const initialSellerTokens = (await uni.getBalance(seller)).toNumber();
    const initialContractBalance = await web3.eth.getBalance(uni.address)
    assert.isAtLeast(initialSellerTokens, 200, 'seller does not have enough tokens');
    // not student calling function
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, accounts[8], 200, 1);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, seller));
      await uni.receiveTransfer(hashedMessage, signature, 200, 1, {from: accounts[8], value: ether(2)});
    }, 'calling from non-student should throw exception') 
    // insufficient transaction fee
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, buyer, 200, 1);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, seller));
      await uni.receiveTransfer(hashedMessage, signature, 200, 1, {from: buyer, value: '199999999999999999'});
    }, 'calling without sufficient transaction fee should throw exception');
    // should fail if seller hasn't signed the message
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, buyer, 200, 1);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, accounts[8]));
      await uni.receiveTransfer(hashedMessage, signature, 200, 1, {from: buyer, value: '200000000000000000'});
    }, 'should fail if non-student signs the message')
    let hashedMessage = web3.utils.soliditySha3(uni.address, buyer, 200, 1);
    let signature = fixSignature(await web3.eth.sign(hashedMessage, seller));
    await uni.receiveTransfer(hashedMessage, signature, 200, 1, {from: buyer, value: '200000000000000000'});
    assert.equal(await uni.getBalance(buyer), initialBuyerTokens + 200, 'buyer did not receive correct amount of tokens');
    assert.equal(await uni.getBalance(seller), initialSellerTokens - 200, 'tokens were not removed from seller');
    assert.equal((await web3.eth.getBalance(uni.address)) - initialContractBalance, '200000000000000000', 'contract did not receive transaction fee');
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, buyer, 200, 1);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, accounts[8]));
      await uni.receiveTransfer(hashedMessage, signature, 200, 1, {from: buyer, value: '200000000000000000'});
    }, 'should fail if nonce re-used')
  });
});
