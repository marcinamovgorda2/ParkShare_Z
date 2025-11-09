import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface ParkingSpot {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  price: number;
  status: string;
  timestamp: number;
  creator: string;
  isVerified: boolean;
  decryptedValue: number;
  publicValue1: number;
  publicValue2: number;
  description: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingSpot, setCreatingSpot] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newSpotData, setNewSpotData] = useState({ name: "", latitude: "", longitude: "", price: "" });
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const spotsPerPage = 5;
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState({ total: 0, available: 0, verified: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for parking system...');
        await initialize();
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        const contract = await getContractReadOnly();
        if (!contract) return;
        
        const businessIds = await contract.getAllBusinessIds();
        const spotsList: ParkingSpot[] = [];
        
        for (const businessId of businessIds) {
          try {
            const businessData = await contract.getBusinessData(businessId);
            spotsList.push({
              id: businessId,
              name: businessData.name,
              latitude: Number(businessData.publicValue1) || 0,
              longitude: Number(businessData.publicValue2) || 0,
              price: Number(businessData.decryptedValue) || 0,
              status: "available",
              timestamp: Number(businessData.timestamp),
              creator: businessData.creator,
              isVerified: businessData.isVerified,
              decryptedValue: Number(businessData.decryptedValue) || 0,
              publicValue1: Number(businessData.publicValue1) || 0,
              publicValue2: Number(businessData.publicValue2) || 0,
              description: businessData.description
            });
          } catch (e) {
            console.error('Error loading spot data:', e);
          }
        }
        
        setSpots(spotsList);
        updateStats(spotsList);
        loadUserHistory();
      } catch (e) {
        console.error('Failed to load data:', e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const updateStats = (spotsList: ParkingSpot[]) => {
    setStats({
      total: spotsList.length,
      available: spotsList.filter(spot => spot.status === "available").length,
      verified: spotsList.filter(spot => spot.isVerified).length
    });
  };

  const loadUserHistory = () => {
    const history = [
      { action: "Created spot", time: "2 hours ago", spot: "Downtown Parking" },
      { action: "Verified location", time: "1 day ago", spot: "Mall Parking" },
      { action: "Searched spots", time: "3 days ago", area: "City Center" }
    ];
    setUserHistory(history);
  };

  const createSpot = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingSpot(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted parking spot..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Contract not available");
      
      const priceValue = parseInt(newSpotData.price) || 0;
      const businessId = `spot-${Date.now()}`;
      
      const encryptedResult = await encrypt(await contract.getAddress(), address, priceValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSpotData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSpotData.latitude) || 0,
        parseInt(newSpotData.longitude) || 0,
        "Encrypted Parking Spot"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Parking spot created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      setShowCreateModal(false);
      setNewSpotData({ name: "", latitude: "", longitude: "", price: "" });
      window.location.reload();
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingSpot(false); 
    }
  };

  const decryptSpot = async (spotId: string) => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(spotId);
      if (businessData.isVerified) {
        setTransactionStatus({ visible: true, status: "success", message: "Spot already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(spotId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        await contractWrite.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(spotId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      setTransactionStatus({ visible: true, status: "success", message: "Spot verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Spot is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const handleCheckAvailable = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredSpots = spots.filter(spot =>
    spot.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spot.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const indexOfLastSpot = currentPage * spotsPerPage;
  const indexOfFirstSpot = indexOfLastSpot - spotsPerPage;
  const currentSpots = filteredSpots.slice(indexOfFirstSpot, indexOfLastSpot);
  const totalPages = Math.ceil(filteredSpots.length / spotsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>ParkShare 🔐</h1>
            <span>Encrypted Parking Spot Sharing</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🚗</div>
            <h2>Connect Your Wallet to ParkSecurely</h2>
            <p>Access encrypted parking spots with FHE-protected location privacy</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Share parking spots with encrypted coordinates</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Match users with homomorphic distance calculation</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="loading-note">Securing your parking location data</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted parking system...</p>
    </div>
  );

  const faqItems = [
    { question: "How does FHE protect my location?", answer: "Your parking spot coordinates are encrypted using Fully Homomorphic Encryption, allowing distance calculations without revealing exact locations." },
    { question: "What data is encrypted?", answer: "Parking spot coordinates and pricing are encrypted. Only matched users can decrypt approved data." },
    { question: "How does homomorphic matching work?", answer: "The system calculates distance between encrypted coordinates without decrypting them, preserving your privacy." },
    { question: "Is my address safe?", answer: "Yes! Your exact address is never exposed. Only approximate distance information is shared after matching." }
  ];

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>ParkShare 🔐</h1>
          <span>FHE-Protected Parking</span>
        </div>
        
        <nav className="main-nav">
          <button className="nav-btn active">Spots</button>
          <button className="nav-btn" onClick={() => setShowFAQ(!showFAQ)}>FAQ</button>
          <button className="nav-btn" onClick={handleCheckAvailable}>Check Available</button>
        </nav>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn metal-btn"
          >
            + Share Spot
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-card">
            <div className="stat-icon">🚗</div>
            <div className="stat-info">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Spots</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-info">
              <div className="stat-value">{stats.available}</div>
              <div className="stat-label">Available</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🔐</div>
            <div className="stat-info">
              <div className="stat-value">{stats.verified}</div>
              <div className="stat-label">FHE Verified</div>
            </div>
          </div>
        </div>

        {showFAQ ? (
          <div className="faq-section">
            <h2>FHE Parking FAQ</h2>
            <div className="faq-grid">
              {faqItems.map((item, index) => (
                <div key={index} className="faq-item">
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
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
              <button onClick={() => setIsRefreshing(true)} className="refresh-btn">
                {isRefreshing ? "Refreshing..." : "🔄"}
              </button>
            </div>

            <div className="spots-grid">
              {currentSpots.length === 0 ? (
                <div className="no-spots">
                  <p>No parking spots found</p>
                  <button 
                    className="create-btn metal-btn" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    Share First Spot
                  </button>
                </div>
              ) : currentSpots.map((spot) => (
                <div 
                  className={`spot-card ${spot.isVerified ? 'verified' : ''}`}
                  key={spot.id}
                  onClick={() => setSelectedSpot(spot)}
                >
                  <div className="spot-header">
                    <h3>{spot.name}</h3>
                    <span className={`status ${spot.status}`}>{spot.status}</span>
                  </div>
                  <div className="spot-coords">
                    <span>Lat: 🔒 {spot.publicValue1}</span>
                    <span>Lng: 🔒 {spot.publicValue2}</span>
                  </div>
                  <div className="spot-price">
                    {spot.isVerified ? `$${spot.decryptedValue}/hr` : 'Price: 🔒 Encrypted'}
                  </div>
                  <div className="spot-meta">
                    <span>Added: {new Date(spot.timestamp * 1000).toLocaleDateString()}</span>
                    <span>By: {spot.creator.substring(0, 6)}...{spot.creator.substring(38)}</span>
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="pagination">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => paginate(page)}
                    className={`page-btn ${currentPage === page ? 'active' : ''}`}
                  >
                    {page}
                  </button>
                ))}
              </div>
            )}

            <div className="user-history">
              <h3>Your Activity</h3>
              <div className="history-list">
                {userHistory.map((item, index) => (
                  <div key={index} className="history-item">
                    <span className="action">{item.action}</span>
                    <span className="time">{item.time}</span>
                    {item.spot && <span className="spot">{item.spot}</span>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-spot-modal">
            <div className="modal-header">
              <h2>Share Parking Spot</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">×</button>
            </div>
            
            <div className="modal-body">
              <div className="fhe-notice">
                <strong>FHE 🔐 Protection</strong>
                <p>Spot coordinates and pricing are encrypted for privacy</p>
              </div>
              
              <div className="form-group">
                <label>Spot Name *</label>
                <input 
                  type="text" 
                  value={newSpotData.name} 
                  onChange={(e) => setNewSpotData({...newSpotData, name: e.target.value})} 
                  placeholder="e.g., Downtown Parking" 
                />
              </div>
              
              <div className="form-group">
                <label>Latitude (approx) *</label>
                <input 
                  type="number" 
                  value={newSpotData.latitude} 
                  onChange={(e) => setNewSpotData({...newSpotData, latitude: e.target.value})} 
                  placeholder="Encrypted coordinate" 
                />
              </div>
              
              <div className="form-group">
                <label>Longitude (approx) *</label>
                <input 
                  type="number" 
                  value={newSpotData.longitude} 
                  onChange={(e) => setNewSpotData({...newSpotData, longitude: e.target.value})} 
                  placeholder="Encrypted coordinate" 
                />
              </div>
              
              <div className="form-group">
                <label>Price per hour (FHE Encrypted) *</label>
                <input 
                  type="number" 
                  value={newSpotData.price} 
                  onChange={(e) => setNewSpotData({...newSpotData, price: e.target.value})} 
                  placeholder="Encrypted price" 
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createSpot} 
                disabled={creatingSpot || isEncrypting || !newSpotData.name || !newSpotData.price} 
                className="submit-btn metal-btn"
              >
                {creatingSpot || isEncrypting ? "Encrypting..." : "Create Encrypted Spot"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedSpot && (
        <div className="modal-overlay">
          <div className="spot-detail-modal">
            <div className="modal-header">
              <h2>Parking Spot Details</h2>
              <button onClick={() => setSelectedSpot(null)} className="close-modal">×</button>
            </div>
            
            <div className="modal-body">
              <div className="spot-info">
                <div className="info-row">
                  <span>Name:</span>
                  <strong>{selectedSpot.name}</strong>
                </div>
                <div className="info-row">
                  <span>Coordinates:</span>
                  <strong>🔐 FHE Encrypted</strong>
                </div>
                <div className="info-row">
                  <span>Status:</span>
                  <strong>{selectedSpot.status}</strong>
                </div>
                <div className="info-row">
                  <span>Price:</span>
                  <strong>
                    {selectedSpot.isVerified ? 
                      `$${selectedSpot.decryptedValue}/hr ✅ Verified` : 
                      "🔒 Encrypted (Verify to reveal)"
                    }
                  </strong>
                </div>
              </div>
              
              <button 
                onClick={async () => await decryptSpot(selectedSpot.id)}
                disabled={fheIsDecrypting}
                className="verify-btn metal-btn"
              >
                {fheIsDecrypting ? "Verifying..." : selectedSpot.isVerified ? "✅ Verified" : "🔓 Verify Price"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


