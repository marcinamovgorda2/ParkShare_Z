pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ParkShare_Z is ZamaEthereumConfig {
    struct ParkingSpot {
        string spotId;
        euint32 encryptedLatitude;
        euint32 encryptedLongitude;
        uint256 publicPrice;
        uint256 publicCapacity;
        string description;
        address owner;
        uint256 timestamp;
        uint32 decryptedLatitude;
        uint32 decryptedLongitude;
        bool isVerified;
    }

    mapping(string => ParkingSpot) public parkingSpots;
    string[] public spotIds;

    event ParkingSpotCreated(string indexed spotId, address indexed owner);
    event DecryptionVerified(string indexed spotId, uint32 decryptedLatitude, uint32 decryptedLongitude);

    constructor() ZamaEthereumConfig() {}

    function createParkingSpot(
        string calldata spotId,
        externalEuint32 encryptedLatitude,
        bytes calldata latitudeProof,
        externalEuint32 encryptedLongitude,
        bytes calldata longitudeProof,
        uint256 publicPrice,
        uint256 publicCapacity,
        string calldata description
    ) external {
        require(bytes(parkingSpots[spotId].spotId).length == 0, "Spot already exists");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedLatitude, latitudeProof)), "Invalid encrypted latitude");
        require(FHE.isInitialized(FHE.fromExternal(encryptedLongitude, longitudeProof)), "Invalid encrypted longitude");

        parkingSpots[spotId] = ParkingSpot({
            spotId: spotId,
            encryptedLatitude: FHE.fromExternal(encryptedLatitude, latitudeProof),
            encryptedLongitude: FHE.fromExternal(encryptedLongitude, longitudeProof),
            publicPrice: publicPrice,
            publicCapacity: publicCapacity,
            description: description,
            owner: msg.sender,
            timestamp: block.timestamp,
            decryptedLatitude: 0,
            decryptedLongitude: 0,
            isVerified: false
        });

        FHE.allowThis(parkingSpots[spotId].encryptedLatitude);
        FHE.allowThis(parkingSpots[spotId].encryptedLongitude);
        FHE.makePubliclyDecryptable(parkingSpots[spotId].encryptedLatitude);
        FHE.makePubliclyDecryptable(parkingSpots[spotId].encryptedLongitude);

        spotIds.push(spotId);
        emit ParkingSpotCreated(spotId, msg.sender);
    }

    function verifyDecryption(
        string calldata spotId,
        bytes memory abiEncodedClearLatitude,
        bytes memory latitudeProof,
        bytes memory abiEncodedClearLongitude,
        bytes memory longitudeProof
    ) external {
        require(bytes(parkingSpots[spotId].spotId).length > 0, "Spot does not exist");
        require(!parkingSpots[spotId].isVerified, "Spot already verified");

        bytes32[] memory cts = new bytes32[](2);
        cts[0] = FHE.toBytes32(parkingSpots[spotId].encryptedLatitude);
        cts[1] = FHE.toBytes32(parkingSpots[spotId].encryptedLongitude);

        FHE.checkSignatures(cts, abiEncodedClearLatitude, latitudeProof);
        FHE.checkSignatures(cts, abiEncodedClearLongitude, longitudeProof);

        uint32 decodedLatitude = abi.decode(abiEncodedClearLatitude, (uint32));
        uint32 decodedLongitude = abi.decode(abiEncodedClearLongitude, (uint32));

        parkingSpots[spotId].decryptedLatitude = decodedLatitude;
        parkingSpots[spotId].decryptedLongitude = decodedLongitude;
        parkingSpots[spotId].isVerified = true;

        emit DecryptionVerified(spotId, decodedLatitude, decodedLongitude);
    }

    function computeDistance(
        string calldata spotId1,
        string calldata spotId2
    ) external view returns (euint32 encryptedDistance) {
        require(bytes(parkingSpots[spotId1].spotId).length > 0, "Spot 1 does not exist");
        require(bytes(parkingSpots[spotId2].spotId).length > 0, "Spot 2 does not exist");

        euint32 latDiff = parkingSpots[spotId1].encryptedLatitude - parkingSpots[spotId2].encryptedLatitude;
        euint32 lonDiff = parkingSpots[spotId1].encryptedLongitude - parkingSpots[spotId2].encryptedLongitude;

        encryptedDistance = latDiff * latDiff + lonDiff * lonDiff;
    }

    function getParkingSpot(string calldata spotId) external view returns (
        string memory spotId_,
        uint256 publicPrice,
        uint256 publicCapacity,
        string memory description,
        address owner,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedLatitude,
        uint32 decryptedLongitude
    ) {
        require(bytes(parkingSpots[spotId].spotId).length > 0, "Spot does not exist");
        ParkingSpot storage spot = parkingSpots[spotId];

        return (
            spot.spotId,
            spot.publicPrice,
            spot.publicCapacity,
            spot.description,
            spot.owner,
            spot.timestamp,
            spot.isVerified,
            spot.decryptedLatitude,
            spot.decryptedLongitude
        );
    }

    function getAllSpotIds() external view returns (string[] memory) {
        return spotIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


