const { ether2wei, ether2weiMinusOne, addStudents, assertRole } = require('./helpers.js');
const University = artifacts.require("University");

contract("AdmissionToken", accounts => {
  let uni = null;

  before( async () => {
    uni = await University.deployed();
    // maximum 18 UOC, 1 Ether fee per UOC
    await uni.init(18, ether2wei(1), {from: accounts[0]});
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
  });

  it('should be initialized', async () => {
    // Check init
    await assertRole(accounts[0], 'Chief', uni);
    let maxUOC = await uni.maxUOC();
    await assert.equal(maxUOC, 18, 'maxUOC was not set correctly');
    let fee = await uni.feePerUOC();
    await assert.equal(fee, ether2wei(1), 'fee was not set correctly');
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

  it('should allow student to pay fees for n units of credit an be assigned tokens', async () => {
    // Invalid Access
    try {
      await uni.payFees(18, {from: accounts[8], value: ether2wei(18)});
      assert.fail('calling payFees from Unknown address did not throw exception');
    } catch {}
    // Too many UOC requested
    try {
      await uni.payFees(19, {from: accounts[3], value: ether2wei(18)});
      assert.fail('calling payFees with too many UOC did not throw exception');
    } catch {}
    // Not enough ether provided
    try {
      await uni.payFees(12, {from: accounts[3], value: ether2weiMinusOne(12)});
      assert.fail('calling payFees with not enough ether did not throw exception');
    } catch {}
    // Valid payment of fees for 12 units of credit
    try {
      await uni.payFees(12, {from: accounts[3], value: ether2wei(12)});
      let paidUOC = await uni.getPaidUOC(accounts[3]);
      assert.equal(paidUOC, 12, 'student paidUOC was not updated correctly');
      let tokenBalance = await uni.getBalance(accounts[3]);
      assert.equal(tokenBalance, 1200, 'student balance was not updated correctly');
    } catch (err) {
      console.log(err);
      assert.fail('valid payment for 12 UOC threw exception');
    }
    // Invalid repayment for 7 UOC making total for student greater than 18 UOC maximum
    try {
      await uni.payFees(7, {from: accounts[3], value: ether2wei(7)});
      assert.fail('calling payFees again to exceed max UOC did not throw exception');
    } catch {}
    // Valid repayment for 6 UOC bringing total paid equal to 18 UOC maximum
    try {
      await uni.payFees(6, {from: accounts[3], value: ether2wei(6)});
      let paidUOC = await uni.getPaidUOC(accounts[3]);
      assert.equal(paidUOC, 18, 'student paidUOC was not updated correctly');
      let tokenBalance = await uni.getBalance(accounts[3]);
      assert.equal(tokenBalance, 1800, 'student balance was not updated correctly');
    } catch (err) {
      console.log(err);
      assert.fail('valid repayment for 6 UOC threw exception');
    }
  })
})
