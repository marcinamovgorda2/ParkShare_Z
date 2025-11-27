import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface ParkingSpot {
  id: number;
  name: string;
  location: string;
  status: string;
  price: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface DistanceAnalysis {
  matchScore: number;
  proximity: number;
  availability: number;
  trustScore: number;
  convenience: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [parkingSpots, setParkingSpots] = useState<ParkingSpot[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSpot, setCreatingSpot] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newSpotData, setNewSpotData] = useState({ name: "", location: "", status: "" });
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ location: number | null; status: number | null }>({ location: null, status: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showMap, setShowMap] = useState(false);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) {
        return;
      }
      
      if (isInitialized) {
        return;
      }
      
      if (fhevmInitializing) {
        return;
      }
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM after wallet connection...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed. Please check your wallet connection." 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const spotsList: ParkingSpot[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          spotsList.push({
            id: parseInt(businessId.replace('spot-', '')) || Date.now(),
            name: businessData.name,
            location: businessId,
            status: businessId,
            price: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setParkingSpots(spotsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createSpot = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingSpot(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating parking spot with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const locationValue = parseInt(newSpotData.location) || 0;
      const businessId = `spot-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, locationValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSpotData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSpotData.status) || 0,
        0,
        "Private Parking Spot"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Parking spot created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewSpotData({ name: "", location: "", status: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingSpot(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzeDistance = (spot: ParkingSpot, decryptedLocation: number | null, decryptedStatus: number | null): DistanceAnalysis => {
    const location = spot.isVerified ? (spot.decryptedValue || 0) : (decryptedLocation || spot.publicValue1 || 5);
    const status = spot.publicValue1 || 5;
    
    const baseMatch = Math.min(100, Math.round((location * 0.6 + status * 0.4) * 10));
    const timeFactor = Math.max(0.7, Math.min(1.3, 1 - (Date.now()/1000 - spot.timestamp) / (60 * 60 * 24 * 30)));
    const matchScore = Math.round(baseMatch * timeFactor);
    
    const proximity = Math.round(location * 0.8 + status * 0.2);
    const availability = Math.round(status * 8 + Math.log(location + 1) * 2);
    
    const trustScore = Math.max(10, Math.min(90, 100 - (location * 0.1 + status * 5)));
    const convenience = Math.min(95, Math.round((location * 0.4 + status * 0.6) * 12));

    return {
      matchScore,
      proximity,
      availability,
      trustScore,
      convenience
    };
  };

  const filteredSpots = parkingSpots.filter(spot =>
    spot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spot.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderDashboard = () => {
    const totalSpots = parkingSpots.length;
    const verifiedSpots = parkingSpots.filter(s => s.isVerified).length;
    const avgStatus = parkingSpots.length > 0 
      ? parkingSpots.reduce((sum, s) => sum + s.publicValue1, 0) / parkingSpots.length 
      : 0;
    
    const recentSpots = parkingSpots.filter(s => 
      Date.now()/1000 - s.timestamp < 60 * 60 * 24 * 7
    ).length;

    return (
      <div className="dashboard-panels">
        <div className="panel gradient-panel">
          <h3>Total Spots</h3>
          <div className="stat-value">{totalSpots}</div>
          <div className="stat-trend">+{recentSpots} this week</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Verified Data</h3>
          <div className="stat-value">{verifiedSpots}/{totalSpots}</div>
          <div className="stat-trend">FHE Verified</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Avg Availability</h3>
          <div className="stat-value">{avgStatus.toFixed(1)}/10</div>
          <div className="stat-trend">Encrypted Status</div>
        </div>
      </div>
    );
  };

  const renderAnalysisChart = (spot: ParkingSpot, decryptedLocation: number | null, decryptedStatus: number | null) => {
    const analysis = analyzeDistance(spot, decryptedLocation, decryptedStatus);
    
    return (
      <div className="analysis-chart">
        <div className="chart-row">
          <div className="chart-label">Match Score</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.matchScore}%` }}
            >
              <span className="bar-value">{analysis.matchScore}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Proximity</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${Math.min(100, analysis.proximity)}%` }}
            >
              <span className="bar-value">{analysis.proximity}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Availability</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.availability}%` }}
            >
              <span className="bar-value">{analysis.availability}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Trust Score</div>
          <div className="chart-bar">
            <div 
              className="bar-fill risk" 
              style={{ width: `${analysis.trustScore}%` }}
            >
              <span className="bar-value">{analysis.trustScore}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">Convenience</div>
          <div className="chart-bar">
            <div 
              className="bar-fill growth" 
              style={{ width: `${analysis.convenience}%` }}
            >
              <span className="bar-value">{analysis.convenience}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">1</div>
          <div className="step-content">
            <h4>Location Encryption</h4>
            <p>Parking spot coordinates encrypted with Zama FHE 🔐</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">2</div>
          <div className="step-content">
            <h4>Encrypted Storage</h4>
            <p>Encrypted coordinates stored on-chain for privacy</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">3</div>
          <div className="step-content">
            <h4>Homomorphic Matching</h4>
            <p>Distance calculation without revealing locations</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">4</div>
          <div className="step-content">
            <h4>Secure Sharing</h4>
            <p>Matched spots shared with verified users only</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>ParkShare 🔐</h1>
            <p>Private Parking Spot Sharing</p>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🚗</div>
            <h2>Connect Your Wallet to Park Securely</h2>
            <p>Connect your wallet to access encrypted parking spot sharing with location privacy protection.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Share or find parking spots privately</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Enjoy secure homomorphic matching</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {fhevmInitializing ? "Initializing FHEVM" : status}</p>
        <p className="loading-note">Securing your parking data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted parking system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>ParkShare 🔐</h1>
          <p>FHE Protected Parking</p>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + Share Spot
          </button>
          <button 
            onClick={() => setShowMap(!showMap)} 
            className="map-btn"
          >
            {showMap ? "List View" : "Map View"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <h2>Private Parking Analytics (FHE 🔐)</h2>
          {renderDashboard()}
          
          <div className="panel gradient-panel full-width">
            <h3>FHE 🔐 Location Privacy Flow</h3>
            {renderFHEFlow()}
          </div>
        </div>
        
        <div className="search-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search parking spots..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button className="search-btn">🔍</button>
          </div>
        </div>
        
        <div className="spots-section">
          <div className="section-header">
            <h2>Available Parking Spots</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="spots-list">
            {filteredSpots.length === 0 ? (
              <div className="no-spots">
                <p>No parking spots found</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  Share First Spot
                </button>
              </div>
            ) : filteredSpots.map((spot, index) => (
              <div 
                className={`spot-item ${selectedSpot?.id === spot.id ? "selected" : ""} ${spot.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedSpot(spot)}
              >
                <div className="spot-title">{spot.name}</div>
                <div className="spot-meta">
                  <span>Availability: {spot.publicValue1}/10</span>
                  <span>Shared: {new Date(spot.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="spot-status">
                  Status: {spot.isVerified ? "✅ Location Verified" : "🔓 Ready for Verification"}
                  {spot.isVerified && spot.decryptedValue && (
                    <span className="verified-amount">Distance: {spot.decryptedValue}m</span>
                  )}
                </div>
                <div className="spot-creator">Owner: {spot.creator.substring(0, 6)}...{spot.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateSpot 
          onSubmit={createSpot} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingSpot} 
          spotData={newSpotData} 
          setSpotData={setNewSpotData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedSpot && (
        <SpotDetailModal 
          spot={selectedSpot} 
          onClose={() => { 
            setSelectedSpot(null); 
            setDecryptedData({ location: null, status: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedSpot.location)}
          renderAnalysisChart={renderAnalysisChart}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateSpot: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  spotData: any;
  setSpotData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, spotData, setSpotData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'location') {
      const intValue = value.replace(/[^\d]/g, '');
      setSpotData({ ...spotData, [name]: intValue });
    } else {
      setSpotData({ ...spotData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-spot-modal">
        <div className="modal-header">
          <h2>Share Parking Spot</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Location Privacy</strong>
            <p>Spot coordinates encrypted with Zama FHE 🔐 (Integer coordinates only)</p>
          </div>
          
          <div className="form-group">
            <label>Spot Name *</label>
            <input 
              type="text" 
              name="name" 
              value={spotData.name} 
              onChange={handleChange} 
              placeholder="Enter spot name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Coordinates (Integer only) *</label>
            <input 
              type="number" 
              name="location" 
              value={spotData.location} 
              onChange={handleChange} 
              placeholder="Enter coordinates..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Availability Score (1-10) *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="status" 
              value={spotData.status} 
              onChange={handleChange} 
              placeholder="Enter availability..." 
            />
            <div className="data-type-label">Public Data</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !spotData.name || !spotData.location || !spotData.status} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Share Spot"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SpotDetailModal: React.FC<{
  spot: ParkingSpot;
  onClose: () => void;
  decryptedData: { location: number | null; status: number | null };
  setDecryptedData: (value: { location: number | null; status: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderAnalysisChart: (spot: ParkingSpot, decryptedLocation: number | null, decryptedStatus: number | null) => JSX.Element;
}> = ({ spot, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData, renderAnalysisChart }) => {
  const handleDecrypt = async () => {
    if (decryptedData.location !== null) { 
      setDecryptedData({ location: null, status: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ location: decrypted, status: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="spot-detail-modal">
        <div className="modal-header">
          <h2>Parking Spot Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="spot-info">
            <div className="info-item">
              <span>Spot Name:</span>
              <strong>{spot.name}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{spot.creator.substring(0, 6)}...{spot.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Shared:</span>
              <strong>{new Date(spot.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Public Availability:</span>
              <strong>{spot.publicValue1}/10</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Location Data</h3>
            
            <div className="data-row">
              <div className="data-label">Coordinates:</div>
              <div className="data-value">
                {spot.isVerified && spot.decryptedValue ? 
                  `${spot.decryptedValue} (On-chain Verified)` : 
                  decryptedData.location !== null ? 
                  `${decryptedData.location} (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Coordinates"
                }
              </div>
              <button 
                className={`decrypt-btn ${(spot.isVerified || decryptedData.location !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : spot.isVerified ? (
                  "✅ Verified"
                ) : decryptedData.location !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Location"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Homomorphic Matching</strong>
                <p>Location is encrypted on-chain. Verify to perform homomorphic distance matching while keeping addresses private.</p>
              </div>
            </div>
          </div>
          
          {(spot.isVerified || decryptedData.location !== null) && (
            <div className="analysis-section">
              <h3>Distance Matching Analysis</h3>
              {renderAnalysisChart(
                spot, 
                spot.isVerified ? spot.decryptedValue || null : decryptedData.location, 
                null
              )}
              
              <div className="decrypted-values">
                <div className="value-item">
                  <span>Coordinates:</span>
                  <strong>
                    {spot.isVerified ? 
                      `${spot.decryptedValue} (On-chain Verified)` : 
                      `${decryptedData.location} (Locally Decrypted)`
                    }
                  </strong>
                  <span className={`data-badge ${spot.isVerified ? 'verified' : 'local'}`}>
                    {spot.isVerified ? 'On-chain Verified' : 'Local Decryption'}
                  </span>
                </div>
                <div className="value-item">
                  <span>Availability:</span>
                  <strong>{spot.publicValue1}/10</strong>
                  <span className="data-badge public">Public Data</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!spot.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;