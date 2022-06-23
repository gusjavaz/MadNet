// SPDX-License-Identifier: MIT-open-group
pragma solidity ^0.8.11;
import "contracts/BridgePool.sol";
import "contracts/libraries/factory/CloneFactory.sol";
import "contracts/utils/ImmutableAuth.sol";
import "hardhat/console.sol";

/// @custom:salt BridgePoolCloneFactory
/// @custom:deploy-type deployUpgradeable
contract BridgePoolCloneFactory is CloneFactory, ImmutableFactory, ImmutableBridgePool {
    // uint256 internal immutable _networkId;
    address internal immutable _implementation;
    BridgePool[] public bridgePoolAddresses;
    event BridgePoolCreated(BridgePool bridgePool);

    constructor(address implementation_) ImmutableFactory(msg.sender) {
        // _networkId = networkId_;
        _implementation = implementation_;
    }

    function cloneBridgePool(address erc20Contract_, address token) external {
        BridgePool bridgePool = BridgePool(payable(createClone(_implementation)));
        bridgePool.initialize(erc20Contract_, token);
        // bridgePoolAddresses.push(bridgePool);
        // bridgePool.deposit(1, msg.sender, 1, 1);
        emit BridgePoolCreated(bridgePool);
    }

    function getBridgePools() external view returns (BridgePool[] memory) {
        return bridgePoolAddresses;
    }
}
