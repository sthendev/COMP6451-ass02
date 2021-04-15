const { ether, fixSignature, assertRevert } = require('./helpers.js');
const University = artifacts.require("University");

contract("University", accounts => {
  it("should assign the creator of the contract to be the chief operating officer intially", async () => {
    const uni = await University.deployed();
    const chief = await uni.chief();
    assert.equal(chief, accounts[0], "chief wasn't set correctly");
  });

  it("should allow the chief to initialize the contract", async () => {
    const uni = await University.deployed();
    // Invalid access
    await assertRevert(async () => {
      await uni.init(18, ether(1), {from: accounts[1]});
    }, 'calling init from non-chief did not raise exception');
    // Valid call
    try {
      await uni.init(18, ether(1), {from: accounts[0]});
      const fee = await uni.feePerUOC();
      assert.equal(fee, ether(1), 'fee was not set correctly');
      const maxUOC = await uni.maxUOC();
      assert.equal(maxUOC, 18, 'max UOC was not sete correctly');
    } catch (err) {
      console.log(err.message);
      assert.fail('valid initialization of contract with chief threw exception');
    }
  });

  it("should allow the chief to transfer the chief position to another address", async () => {
    const uni = await University.deployed();
    // Invalid access
    await assertRevert(async () => {
      await uni.transferChief(accounts[1], {from: accounts[1]});
    }, 'non-chief was able to change chief');
    // Valid access
    try {
      await uni.transferChief(accounts[1], {from: accounts[0]});
      const chief = await uni.chief();
      assert.equal(chief, accounts[1], 'chief was not changed correctly');
      // Cleanup
      await uni.transferChief(accounts[0], {from: accounts[1]});
    } catch (err) {
      console.log(err.message);
      assert.fail('chief was unable to transfer chief')
    }
  });

  it("should allow the chief to add university administrators", async () => {
    const uni = await University.deployed();
    let user1_role = await uni.getRole(accounts[1]);
    let user2_role = await uni.getRole(accounts[2]);
    assert.notEqual(user1_role, 'Admin', 'user1 is already an admin');
    assert.notEqual(user2_role, 'Admin', 'user2 is already an admin');
    // Invalid access
    await assertRevert(async () => {
      await uni.addAdmins([accounts[1], accounts[2]], {from: accounts[2]});
    }, 'calling addAdmins from non-chief did not throw exception');
    // Valid access
    try {
      await uni.addAdmins([accounts[1], accounts[2]], {from: accounts[0]});
      user1_role = await uni.getRole(accounts[1]);
      user2_role = await uni.getRole(accounts[2]);
      assert.equal(user1_role, 'Admin', 'user1 was not made an admin');
      assert.equal(user2_role, 'Admin', 'user2 was not made an admin');
    } catch (err) {
      console.log(err.message);
      assert.fail('calling addAdmins from chief with valid addresses raised exception');
    }
  });

  it("should allow the chief to remove university administrators", async () => {
    const uni = await University.deployed();
    let user1_role = await uni.getRole(accounts[1]);
    let user2_role = await uni.getRole(accounts[2]);
    assert.equal(user1_role, 'Admin', 'user1 is not an admin');
    assert.equal(user2_role, 'Admin', 'user2 is not an admin');
    // Invalid access - Unknown role
    await assertRevert(async () => {
      await uni.removeAdmin(accounts[1], {from: accounts[3]});
    }, 'calling removeAdmin from unknown role did not throw exception');
    // Invalid access - Admin role
    await assertRevert(async () => {
      await uni.removeAdmin(accounts[2], {from: accounts[1]});
    }, 'calling removeAdmin from admin role did not throw exception');
    // Valid access
    try {
      await uni.removeAdmin(accounts[2], {from: accounts[0]});
      user2_role = await uni.getRole(accounts[2]);
      assert.equal(user2_role, 'Unknown', 'admin role was not successfully removed');
    } catch (err) {
      console.log(err.message);
      assert.fail('calling removeAdmin from chief with valid address threw exception');
    }
  });

  it("should allow a student to enrol in the university by providing message signed by an adminstrator", async () => {
    const uni = await University.deployed();
    const administrator = accounts[1];
    const potentialStudent = accounts[2];
    const notAdministrator = accounts[3];
    assert.equal(await uni.getRole(administrator), 'Admin', 'not an administrator');
    assert.equal(await uni.getRole(potentialStudent), 'Unknown', 'potentialStudent already has a role');
    assert.notEqual(await uni.getRole(notAdministrator), 'Admin', 'notAdministrator is an administrator');
    // Hashed with wrong contract
    await assertRevert(async () => {
      const wrongUni = await University.new();
      let hashedMessage = web3.utils.soliditySha3(wrongUni.address, potentialStudent);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
      await uni.enroll(hashedMessage, signature, {from: potentialStudent});
    }, 'hashing with wrong contract address should have thrown error');
    // Hashed with someone else's address
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, accounts[3]);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
      await uni.enroll(hashedMessage, signature, {from: potentialStudent});
    }, "hashing with someone else's address should have thrown error");
    // Signed by someone who is not a university administrator
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, potentialStudent);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, notAdministrator));
      await uni.enroll(hashedMessage, signature, {from: potentialStudent});
    }, "signing with non-administrator should have thrown error");
    // Valid call
    try {
      let hashedMessage = web3.utils.soliditySha3(uni.address, potentialStudent);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
      await uni.enroll(hashedMessage, signature, {from: potentialStudent});
      let potentialStudentRole = await uni.getRole(potentialStudent);
      assert.equal(potentialStudentRole, 'Student', 'potentialStudent role was not correctly updated');
    } catch (err) {
      console.log(err);
      assert.fail('valid enroll call failed');
    }
    // Already is a student
    await assertRevert(async () => {
      let hashedMessage = web3.utils.soliditySha3(uni.address, potentialStudent);
      let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
      await uni.enroll(hashedMessage, signature, {from: potentialStudent});
    }, 'calling enroll as a student should have failed');
  });

  it("should allow an administrator to create a course", async () => {
    const uni = await University.deployed();
    const administrator = accounts[1];
    const notAdministrator = accounts[3];
    // Invalid Access
    await assertRevert(async () => {
      await uni.createCourse(web3.utils.fromAscii('COMP6451'), 2, 6, {from: notAdministrator});
    }, 'calling createCourse from non-admin did not throw exception');
    // Trying to create course with 0 UOC
    await assertRevert(async () => {
      await uni.createCourse(web3.utils.fromAscii('COMP6451'), 2, 0, {from: administrator});
    }, 'trying to create course with 0 UOC did not throw exception');
    // Trying to create course with 0 quota
    await assertRevert(async () => {
      await uni.createCourse(web3.utils.fromAscii('COMP6451'), 0, 6, {from: administrator});
    }, 'trying to create course with 0 quota did not throw exception');
    // Valid course creation
    try {
      await uni.createCourse(web3.utils.fromAscii('COMP6451'), 2, 6, {from: administrator});
      let courses = (await uni.getCourses()).map(el => web3.utils.hexToAscii(el));
      assert.sameMembers(courses, ['COMP6451'], 'course was not added correctly');
    } catch (err) {
      console.log(err);
      assert.fail('valid course creation with admin failed');
    }
    // Trying to add same course twice
    await assertRevert(async () => {
      await uni.createCourse(web3.utils.fromAscii('COMP6451'), 1, 4, {from: administrator});
    }, 'trying to create same twice should have thrown exception');
  });
});

