// SPDX-License-Identifier: MIT-open-group
pragma solidity ^0.8.11;
import "contracts/Proxy.sol";
import "contracts/libraries/factory/CloneFactory.sol";
import "contracts/utils/ImmutableAuth.sol";
import "hardhat/console.sol";

/// @custom:salt BridgePoolCloneFactory
/// @custom:deploy-type deployUpgradeable
contract BridgePoolCloneFactory is CloneFactory, ImmutableFactory, ImmutableBridgePool {
    uint256 internal immutable _networkId;
    BridgePool[] public bridgePoolAddresses;
    event BridgePoolCreated(BridgePool bridgePool);

    constructor(uint256 networkId_) ImmutableFactory(msg.sender) {
        _networkId = networkId_;
    }

    function cloneBridgePool(address erc20Contract_, address token) external {
        BridgePool bridgePool = BridgePool(payable(createClone(_bridgePoolAddress())));
        bridgePool.initialize(erc20Contract_, token);
        bridgePoolAddresses.push(bridgePool);
        console.log(address(bridgePool));
        emit BridgePoolCreated(bridgePool);
    }

    function getBridgePools() external view returns (BridgePool[] memory) {
        return bridgePoolAddresses;
    }
}
