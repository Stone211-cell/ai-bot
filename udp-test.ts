import dgram from 'dgram';

const client = dgram.createSocket('udp4');
let received = false;

client.on('error', (err) => {
  console.log(`[UDP ERROR] ${err.message}`);
  client.close();
  process.exit(1);
});

client.on('message', (msg, info) => {
  console.log(`[UDP SUCCESS] Received response from ${info.address}:${info.port}`);
  received = true;
  client.close();
  process.exit(0);
});

// Create a valid DNS query packet for google.com
const dnsPacket = Buffer.from([
  0xdb, 0x42, // Transaction ID
  0x01, 0x00, // Flags: Standard query
  0x00, 0x01, // Questions: 1
  0x00, 0x00, // Answer RRs: 0
  0x00, 0x00, // Authority RRs: 0
  0x00, 0x00, // Additional RRs: 0
  0x06, 0x67, 0x6f, 0x6f, 0x67, 0x6c, 0x65, // 'google'
  0x03, 0x63, 0x6f, 0x6d, // 'com'
  0x00, // End of name
  0x00, 0x01, // Type: A
  0x00, 0x01  // Class: IN
]);

console.log('Sending UDP packet to 8.8.8.8:53...');
client.send(dnsPacket, 53, '8.8.8.8', (err) => {
  if (err) {
    console.log(`[UDP SEND ERROR] ${err.message}`);
    client.close();
    process.exit(1);
  }
  console.log('Packet sent! Waiting for response (Timeout in 5 seconds)...');
});

setTimeout(() => {
  if (!received) {
    console.log('[UDP TIMEOUT] No response received. UDP IS BLOCKED on this network/machine!');
    client.close();
    process.exit(1);
  }
}, 5000);
