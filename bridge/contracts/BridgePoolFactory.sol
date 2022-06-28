// SPDX-License-Identifier: MIT-open-group
pragma solidity ^0.8.11;
import "contracts/AliceNetFactory.sol";
import "contracts/libraries/factory/AliceNetFactoryBase.sol";
import "contracts/libraries/factory/BridgePoolFactoryBase.sol";
import "contracts/BridgePool.sol";
import "contracts/Proxy.sol";
import "contracts/utils/ImmutableAuth.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @custom:salt BridgePoolFactory
/// @custom:deploy-type deployUpgradeable
contract BridgePoolFactory is
    BridgePoolFactoryBase,
    Initializable,
    ImmutableFactory,
    ImmutableBridgePoolFactory,
    ImmutableBridgePoolDepositNotifier
{
    uint256 internal immutable _networkId;
    string internal constant _BRIDGE_POOL_TAG = "ERC";
    event BridgePoolCreated(address contractAddr);

    /** 
    @dev slot for storing implementation address
    */
    address private _implementation;

    constructor(uint256 networkId_) ImmutableFactory(msg.sender) {
        _networkId = networkId_;
    }

    function deployImplementation() public onlyFactory {
        bytes memory callData = abi.encodeWithSelector(this.deployViaFactoryLogic.selector);
        address impAddress = Proxy(payable(address(this))).getImplementationAddress();
        AliceNetFactory(_factoryAddress()).delegateCallAny(impAddress, callData);
    }

    /**
     * @notice deployViaFactoryLogic deploys a BridgePool contract between ERC20 token and token
     */
    function deployViaFactoryLogic() public onlyBridgePoolFactory {
        bytes memory deployCode = bytes.concat(type(BridgePool).creationCode);
        AliceNetFactory(_factoryAddress()).deployTemplate(deployCode);
        bytes32 salt = bytes32("BridgePool"); //set correct salt
        uint256 value = 0;
        _implementation = AliceNetFactory(_factoryAddress()).deployCreate2(value, salt, deployCode);
        console.log("implementation", _implementation);
    }

    /**
     * @notice deployNewPool delegates call to this contract's method "deployViaFactoryLogic" through alicenet factory
     * @param erc20Contract_ address of ERC20 token contract
     * @param token address of bridge token contract
     */
    function deployNewPool(address erc20Contract_, address token) public {
        bytes memory initCallData = abi.encodePacked(erc20Contract_, token);
        bytes32 salt = getSaltFromERC20Address(erc20Contract_);
        address contractAddr = BridgePoolFactory(this)._deployStaticPool(salt, initCallData);
        emit BridgePoolCreated(contractAddr);
    }

    /**
     * @notice getSaltFromAddress calculates salt for a BridgePool contract based on ERC20 contract's address
     * @param erc20Contract_ address of ERC20 contract of BridgePool
     * @return calculated salt
     */
    function getSaltFromERC20Address(address erc20Contract_)
        public
        view
        returns (
            //onlyBridgePoolDepositNotifier
            bytes32
        )
    {
        return
            keccak256(
                bytes.concat(
                    keccak256(abi.encodePacked(erc20Contract_)),
                    keccak256(abi.encodePacked(_BRIDGE_POOL_TAG)),
                    keccak256(abi.encodePacked(_networkId))
                )
            );
    }

    function getStaticPoolContractAddress(bytes32 _salt, address _factory)
        public
        pure
        returns (address)
    {
        // byte code for metamorphic contract
        // 363636335af43d36363e3d36f3
        bytes32 metamorphicContractBytecodeHash_ = 0x61e88a68b643ae010dbd8372df328fcc64b9dc96e993e5d530691bf35d8e5ae4;
        return
            address(
                uint160(
                    uint256(
                        keccak256(
                            abi.encodePacked(
                                hex"ff",
                                _factory,
                                _salt,
                                metamorphicContractBytecodeHash_
                            )
                        )
                    )
                )
            );
    }

    function impl() public {
        console.log("imp", _implementation);
    }

    fallback() external {
        address implementation_ = _implementation;
        console.log("fallbacking", _implementation);
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, shl(176, 0x363d3d373d3d3d363d73))
            mstore(add(ptr, 0xa), shl(96, implementation_))
            mstore(add(ptr, 0x1e), shl(136, 0x5af43d82803e903d91602b57fd5bf3))
            return(ptr, 0x35)
        }
    }
}
