function ether(amount, addition = 0) {
  return (BigInt(amount * 10**18) + BigInt(addition)).toString();
}

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

async function addStudents(students, administrator, hashfn, signfn, uni) {
  for (student of students) {
    let hashedmessage = hashfn(uni.address, student);
    let signature = fixSignature(await signfn(hashedmessage, administrator));
    await uni.enroll(hashedmessage, signature, {from: student});
  }
}

async function assertRole(account, role, uni, account_idx) {
  let account_role = await uni.getRole(account);
  assert.equal(account_role, role, `account ${account_idx} is not a ${role}`);
}

async function assertRevert(testFunc, message) {
  try {
    await testFunc();
    throw null;
  } catch (err) {
    assert.notEqual(err, null, message);
  }
}

module.exports = {
  ether: ether,
  fixSignature: fixSignature,
  addStudents: addStudents,
  assertRole: assertRole,
  assertRevert: assertRevert
}
