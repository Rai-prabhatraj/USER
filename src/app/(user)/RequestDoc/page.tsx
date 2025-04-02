"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "react-toastify";
import { ethers } from "ethers";
import axios from "axios"; // Add axios for HTTP requests

const DocumentRequestForm = () => {
  const [formData, setFormData] = useState({
    documentType: "",
    receiverId: "",
    additionalInfo: "",
  });
  const [walletId, setWalletId] = useState(""); // Wallet Address
  const [selectedDocument, setSelectedDocument] = useState("");
  const [documents, setDocuments] = useState([]); // Fetched documents array
  const [requiredCIDs, setRequiredCIDs] = useState({});
  const [files, setFiles] = useState({});
  const [isUploading, setIsUploading] = useState(false);

  const receiver = "0x21fF6FcC89e8ed65318059527d390FaF6aC5830a";

  const documentTypes = {
    "Migration Certificate": {
      requiredFields: ["Birth Certificate", "XII Marksheet"],
      issuingAuthority: "School/College Administration",
    },
    "School Leaving Certificate": {
      requiredFields: ["XII Marksheet"],
      issuingAuthority: "School Principal/Headmaster",
    },
    "Passport": {
      requiredFields: ["Birth Certificate"],
      issuingAuthority: "Ministry of External Affairs, Government of India",
    },
    "Disability Certificate": {
      requiredFields: ["Birth Certificate", "Medical Report"],
      issuingAuthority: "Chief Medical Officer (CMO), Government Hospital",
    },
    "Income Certificate": {
      requiredFields: ["Salary Slip"],
      issuingAuthority: "Revenue Department, State Government",
    },
    "Death Certificate": {
      requiredFields: ["Birth Certificate", "Death Report"],
      issuingAuthority: "Registrar of Births and Deaths, Municipal Corporation",
    },
    "XII Marksheet": {
      requiredFields: ["Admit Card"],
      issuingAuthority: "Ministry of Education/State Education Board",
    },
    "Domicile Certificate": {
      requiredFields: ["Birth Certificate", "Proof of Residence"],
      issuingAuthority: "District Magistrate/Tehsildar, State Government",
    },
  };

  useEffect(() => {
    const connectWallet = async () => {
      if (typeof window === "undefined" || !window.ethereum) {
        toast.error("MetaMask is not installed.");
        return;
      }

      try {
        // Fix for ethers v6
        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();
        setWalletId(address);
        console.log("Connected wallet address:", address);
      } catch (err) {
        console.error("Error connecting wallet:", err);
        toast.error("Failed to connect wallet.");
      }
    };

    connectWallet();
  }, []);

  // Fetch documents from server
  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        const response = await fetch(
          "https://backendpramanik.onrender.com/user/getIssuedDocuments",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiver }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch documents");
        }

        const data = await response.json();
        setDocuments(data); // Assuming the response contains an array of documents
      } catch (err) {
        console.error("Error fetching documents:", err);
      }
    };

    fetchDocuments();
  }, [receiver]);

  const handleDocumentChange = (event) => {
    const selectedType = event.target.value;
    setSelectedDocument(selectedType);
  
    if (selectedType) {
      const requiredFields = documentTypes[selectedType].requiredFields;
      const matchedCIDs = {};
  
      requiredFields.forEach((field) => {
        const matchedDoc = documents.find((doc) => doc.message === field);
        matchedCIDs[field] = matchedDoc ? matchedDoc.cid : null;
      });
  
      setRequiredCIDs(matchedCIDs);
    }
  };

  const handleFileChange = (event, field) => {
    const file = event.target.files ? event.target.files[0] : null;
    setFiles((prevFiles) => ({ ...prevFiles, [field]: file }));
  };

  // Function to upload a file to IPFS using Pinata
  const uploadToPinata = async (file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Replace with your Pinata API keys
      const pinataApiKey = process.env.NEXT_PUBLIC_PINATA_API_KEY;
      const pinataSecretApiKey = process.env.NEXT_PUBLIC_PINATA_SECRET_API_KEY;
      
      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            'Content-Type': `multipart/form-data`,
            'pinata_api_key': pinataApiKey,
            'pinata_secret_api_key': pinataSecretApiKey,
          },
        }
      );
      
      // Return the IPFS CID (hash)
      return response.data.IpfsHash;
    } catch (error) {
      console.error("Error uploading to Pinata:", error);
      throw new Error("Failed to upload file to IPFS");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
  
    if (!walletId) {
      toast.error("Please connect your wallet before submitting the request.", {
        autoClose: 3000,
      });
      return;
    }
    
    try {
      setIsUploading(true);
      
      // Process files that need to be uploaded
      const updatedCIDs = { ...requiredCIDs };
      
      // Upload any files that don't have CIDs yet
      for (const [field, file] of Object.entries(files)) {
        if (file && !requiredCIDs[field]) {
          toast.info(`Uploading ${field} to IPFS...`, { autoClose: false });
          try {
            const cid = await uploadToPinata(file);
            updatedCIDs[field] = cid;
            toast.success(`${field} uploaded successfully!`, { autoClose: 2000 });
          } catch (error) {
            toast.error(`Failed to upload ${field}`, { autoClose: 3000 });
            setIsUploading(false);
            return;
          }
        }
      }
      
      // Combine all CIDs (both existing and newly uploaded)
      const cidsArray = Object.entries(updatedCIDs).map(([field, cid]) => {
        return cid ? `${cid}` : null;
      }).filter(cid => cid !== null);
      
      const formDataObj = {
        doctype: selectedDocument,
        issuingAuthority: documentTypes[selectedDocument]?.issuingAuthority || "",
        message: formData.additionalInfo,
        cid: cidsArray.join(', '), // Format: "Field1:CID1, Field2:CID2"
        receiver: walletId,
        status: "Pending",
      };
    
      const response = await fetch("https://backendpramanik.onrender.com/user/requestDocument", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formDataObj),
      });
    
      if (!response.ok) {
        throw new Error("Failed to send request");
      }
    
      const data = await response.json();
      toast.success("Request submitted successfully!", { autoClose: 3000 });
      setSelectedDocument("");
      setFiles({});
      setRequiredCIDs({});
      console.log("Request data:", data);
    } catch (err) {
      console.error("Error submitting request:", err);
      toast.error("Failed to submit request. Please try again.", {
        autoClose: 3000,
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  return (
    <div className="p-8 bg-gradient-to-br from-white to-indigo-100 shadow-lg rounded-lg max-w-3xl mx-auto mt-8 border border-indigo-200">
      <h2 className="text-3xl font-bold mb-6 text-indigo-800 text-center">Request a Document</h2>
      
      <div className="mb-6">
        <Button className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg transition-colors duration-300 font-medium">
          {walletId
            ? `Wallet Connected: ${walletId.slice(0, 6)}...${walletId.slice(
                -4
              )}`
            : "Connecting..."}
        </Button>
      </div>
  
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label
            htmlFor="document-type"
            className="block font-semibold text-gray-700 mb-2"
          >
            Document Type
          </label>
          <select
            id="document-type"
            value={selectedDocument}
            onChange={handleDocumentChange}
            className="border border-indigo-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">--Select Document--</option>
            {Object.keys(documentTypes).map((doc) => (
              <option key={doc} value={doc}>
                {doc}
              </option>
            ))}
          </select>
        </div>
  
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {selectedDocument && (
            <div className="mb-4">
              <label className="block font-semibold text-gray-700 mb-2">Issuing Authority</label>
              <input
                type="text"
                value={documentTypes[selectedDocument].issuingAuthority}
                readOnly
                disabled
                className="border rounded-lg p-3 w-full bg-gray-100 text-gray-500"
              />
            </div>
          )}
  
          {selectedDocument === "Migration Certificate" && (
            <div className="mb-4">
              <label htmlFor="board" className="block font-semibold text-gray-700 mb-2">
                Select Board
              </label>
              <select
                id="board"
                className="border border-indigo-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                onChange={(e) => console.log("Selected board:", e.target.value)}
              >
                <option value="">--Select Board--</option>
                <option value="CBSE">CBSE</option>
                <option value="MP">MP</option>
                <option value="Chhattisgarh">Chhattisgarh</option>
                <option value="Other">Other</option>
              </select>
            </div>
          )}
        </div>
        
        <hr className="bg-indigo-300 h-1 my-6 rounded-full"></hr>
  
        {selectedDocument && (
          <div className="bg-white p-6 rounded-lg shadow-sm mb-6">
            <h3 className="text-xl font-semibold mb-4 text-indigo-700">
              {selectedDocument} -{" "}
              <span className="text-gray-600">{documentTypes[selectedDocument].issuingAuthority}</span>
            </h3>
            {documentTypes[selectedDocument].requiredFields.map((field) => (
              <div key={field} className="mb-5">
                <label className="block font-semibold text-gray-700 mb-2">
                  {field}{" "}
                  <span className={requiredCIDs[field] ? "text-green-600" : "text-blue-600"}>
                    {requiredCIDs[field] ? "(Auto-filled)" : "(Upload Required)"}
                  </span>
                </label>
                {requiredCIDs[field] ? (
                  <div>
                    <input
                      type="text"
                      value={requiredCIDs[field] || ""}
                      readOnly
                      disabled
                      className="border rounded-lg p-3 w-full bg-gray-100 text-gray-500"
                    />
                    <p className="text-xs text-gray-500 mt-2 flex items-center">
                      <span className="font-medium mr-1">IPFS CID:</span> {requiredCIDs[field]}
                    </p>
                  </div>
                ) : (
                  <div>
                    <input
                      type="file"
                      onChange={(e) => handleFileChange(e, field)}
                      className="border border-indigo-300 rounded-lg p-3 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      accept=".pdf,.jpg,.png,.jpeg"
                    />
                    {files[field] && (
                      <p className="text-xs text-green-600 mt-2 flex items-center">
                        <span className="font-medium mr-1">File selected:</span> {files[field]?.name}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
  
        <div className="mb-6">
          <label className="block font-semibold text-gray-700 mb-2">
            Additional Information
          </label>
          <Textarea
            name="additionalInfo"
            value={formData.additionalInfo}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                additionalInfo: e.target.value,
              }))
            }
            placeholder="Enter any additional details"
            className="border border-indigo-300 rounded-lg p-3 w-full min-h-24 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
  
        <Button 
          type="submit" 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-lg transition-colors duration-300 font-medium text-lg"
          disabled={isUploading}
        >
          {isUploading ? 
            <span className="flex items-center justify-center">
              <span className="mr-2">Uploading Files...</span>
            </span> : 
            "Submit Request"
          }
        </Button>
      </form>
    </div>
  );
};

export default DocumentRequestForm;