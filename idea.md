# Feature wise 

1. Make the shipment form editable before the passport is minted.

2. When a shipment is created, and the passport is minted, a record is created in the API server.

3. Create an UI in the server that can update the status of the shipment.

4. We can update the status from there and verify that the risk agent is able to capture the status.


# Agent 
1. Risk agent in the shipment page 
    Refer to memwal
    Call SERP API for the latest news 
    Able to flag potential delay and suggest new shipping dates or   even edit by itself

2. Persistent monitoring agent 
    Check the status every 5 mins by pinging the API server.    
    Check the news as well using SERP API and notify exporter and importer on the potential delay.

    Have to check 
    The Upgrade: Allow the user to grant the agent limited permissions. If the SERP API and MemWal data confirm a critical delay, the agent could automatically execute a Sui smart contract function to update the on-chain status to "Delayed" and mint a new route proposal, rather than just pinging the user's chatbot.

# Seal
You upload all the heavy shipment documents (PDFs, manifests) to Walrus, but encrypt them natively using Seal. You use Sui smart contracts to enforce access policies. For example, the carrier's wallet can only decrypt the routing instructions, while the customs authority's wallet can decrypt the full manifest.  