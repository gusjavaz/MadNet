// SPDX-License-Identifier: MIT-open-group
pragma solidity ^0.8.11;
import "hardhat/console.sol";
import "contracts/BridgePoolFactory.sol";
import "contracts/Proxy.sol";
import "contracts/utils/ImmutableAuth.sol";

contract BridgePoolFactoryBase {
    function _deployStaticPool(bytes32 salt_, bytes memory initCallData_)
        external
        returns (address contractAddr)
    {
        address contractAddr;
        uint256 dataSize;
        uint256 codeSize;
        address msgSender;
        address callerAddress = Proxy(payable(msg.sender)).getImplementationAddress();
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, shl(216, 0x5880818273))
            mstore(add(ptr, 5), shl(96, callerAddress))
            mstore(add(add(ptr, 5), 20), shl(184, 0x5af43d36363e3d36f3))
            contractAddr := create2(0, ptr, 34, salt_)

            //if the returndatasize is not 0 revert with the error message
            dataSize := returndatasize()
            codeSize := extcodesize(contractAddr)
            if iszero(iszero(returndatasize())) {
                returndatacopy(0x00, 0x00, returndatasize())
                revert(0, returndatasize())
            }
            //if contractAddr or code size at contractAddr is 0 revert with deploy fail message
            if or(iszero(contractAddr), iszero(extcodesize(contractAddr))) {
                mstore(0, "static pool deploy failed")
                revert(0, 0x20)
            }
        }
        console.log("datasize", dataSize, contractAddr, codeSize);

        /*         if (initCallData_.length > 0) {
            _initializeContract(contractAddr, initCallData_);
        }
        _codeSizeZeroRevert((_extCodeSize(contractAddr) != 0)); */
        return contractAddr;
    }
}
