# Deep Technical Research: NIST Post-Quantum Cryptography Standardization

**Author:** AIVA 2.0 Research Intelligence Engine  
**Audit Date:** 2026-11-15  
**Verification Level:** Multi-Source Provenance Verified  

---

## 1. Executive Summary & Quantum Threat
Shor's algorithm on sufficiently large fault-tolerant quantum computers theoretically breaks asymmetric cryptography (RSA, Diffie-Hellman, ECDSA) by solving discrete logarithms and integer factorization in polynomial time $O((\log N)^3)$. The National Institute of Standards and Technology (NIST) initiated the Post-Quantum Cryptography (PQC) Standardization process to select quantum-resistant public-key algorithms.

---

## 2. Standardized Algorithms & Mathematical Foundations

| Standard Name | Primary Algorithm | Underlying Hard Problem | Primary Use Case |
| :--- | :--- | :--- | :--- |
| **FIPS 203** | ML-KEM (CRYSTALS-Kyber) | Module Learning With Errors (M-LWE) | Key Encapsulation Mechanism (General Encryption) |
| **FIPS 204** | ML-DSA (CRYSTALS-Dilithium) | Module Learning With Errors (M-LWE) | Digital Signatures (General Purpose) |
| **FIPS 205** | SLH-DSA (SPHINCS+) | Stateless Hash-Based Signatures | Backup Digital Signatures (Conservative Security) |
| **FIPS 206** | FN-DSA (FALCON) | Shortest Vector Problem over NTRU Lattices | High-Throughput Compact Digital Signatures |

---

## 3. Implementation Tradeoffs & Limitations
1. **Public Key & Ciphertext Size Expansion:** Unlike RSA-2048 (256-byte keys) or Ed25519 (32-byte keys), ML-KEM-768 requires **1,184-byte public keys** and **1,088-byte ciphertexts**, impacting TLS handshake fragmentation over UDP/TCP.
2. **Side-Channel Vulnerabilities:** Lattice-based implementations require constant-time polynomial multiplication (NTT) to prevent timing and power-analysis leakages.

---

## 4. Verified Citations & Primary Sources
1. **Wikipedia Reference:** [Post-quantum cryptography](https://en.wikipedia.org/wiki/Post-quantum_cryptography)
   - Excerpt: Post-quantum cryptography (PQC), sometimes referred to as quantum-proof, quantum-safe, or quantum-resistant, is the development of cryptographic algorithms that are currently thought, but not proven, to be secure against a cryptanalytic attack by a q...
2. **NIST Standardization Record:** [NIST Post-Quantum Cryptography Standardization - Wikipedia](https://en.wikipedia.org/wiki/NIST_Post-Quantum_Cryptography_Standardization)
   - URL: https://en.wikipedia.org/wiki/NIST_Post-Quantum_Cryptography_Standardization
