const University = artifacts.require("University");

// Taken from @openzeppelin/test/helpers/sign.js to make web3.eth.sign compatible
// with ECDSA.recover from openzeppelin when using truffle suite
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

contract("University", accounts => {
    it("should assign the creator of the contract to be the chief operating officer intially", async () => {
        const uni = await University.deployed();
        const chief = await uni.chief();
        assert.equal(chief, accounts[0], "chief wasn't set correctly");
    });

    it("should set the fee per UOC to be 0 initially", async () => {
        const uni = await University.deployed();
        const fee = await uni.feePerUOC();
        assert.equal(fee, 0, "fee wasn't initialized to 0");
    });

    it("should allow the chief to set the fee per UOC", async () => {
        const uni = await University.deployed();
        // Invalid access
        try {
            await uni.setFee('1000000000000000000', {from: accounts[1]});
            assert.fail('calling setFee from non-chief did not raise exception');
        } catch {}
        // Valid access
        try {
            await uni.setFee('1000000000000000000', {from: accounts[0]});
            const fee = await uni.feePerUOC();
            assert.equal(fee, '1000000000000000000', 'fee was not set correctly');
        } catch (err) {
            console.log(err.message);
            assert.fail('setting fee with chief operating officer threw exception');
        }
    });

    it("should allow the chief to transfer the chief position to another address", async () => {
        const uni = await University.deployed();
        // Invalid access
        try {
            await uni.transferChief(accounts[1], {from: accounts[1]});
            assert.fail('non-chief was able to change chief');
        } catch {}
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
        try {
            await uni.addAdmins([accounts[1], accounts[2]], {from: accounts[2]});
            assert.fail('calling addAdmins from non-chief did not throw exception');
        } catch {}
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
        try {
            await uni.removeAdmin(accounts[1], {from: accounts[3]});
            assert.fail('calling removeAdmin from unknown role did not throw exception');
        } catch {}
        // Invalid access - Admin role
        try {
            await uni.removeAdmin(accounts[2], {from: accounts[1]});
            assert.fail('calling removeAdmin from admin role did not throw exception');
        } catch {}
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
        try {
            const wrongUni = await University.new();
            let hashedMessage = web3.utils.soliditySha3(wrongUni.address, potentialStudent);
            let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
            await uni.enroll(hashedMessage, signature, {from: potentialStudent});
            assert.fail('hashing with wrong contract address should have thrown error');
        } catch {}
        // Hashed with someone else's address
        try {
            let hashedMessage = web3.utils.soliditySha3(uni.address, accounts[3]);
            let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
            await uni.enroll(hashedMessage, signature, {from: potentialStudent});
            assert.fail("hashing with someone else's address should have thrown error");
        } catch {}
        // Signed by someone who is not a university administrator
        try {
            let hashedMessage = web3.utils.soliditySha3(uni.address, potentialStudent);
            let signature = fixSignature(await web3.eth.sign(hashedMessage, notAdministrator));
            await uni.enroll(hashedMessage, signature, {from: potentialStudent});
            assert.fail("signing with non-administrator should have thrown error");
        } catch {}
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
        try {
            let hashedMessage = web3.utils.soliditySha3(uni.address, potentialStudent);
            let signature = fixSignature(await web3.eth.sign(hashedMessage, administrator));
            await uni.enroll(hashedMessage, signature, {from: potentialStudent});
            assert.fail('calling enroll as a student should have failed');
        } catch {}
    });
});

