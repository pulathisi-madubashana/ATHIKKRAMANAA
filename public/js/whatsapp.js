// Initialize Socket.io
const socket = io();

// DOM Elements
const badge = document.getElementById('conn-badge');
const pulse = document.getElementById('conn-pulse');
const connText = document.getElementById('conn-text');
const qrSection = document.getElementById('qr-section');
const qrImg = document.getElementById('qr-img');
const qrLoading = document.getElementById('qr-loading');
const profileSection = document.getElementById('profile-section');
const profileName = document.getElementById('profile-name');
const profilePhone = document.getElementById('profile-phone');
const lastConnected = document.getElementById('last-connected');
const btnTest = document.getElementById('btn-test');

// Listen for updates
socket.on('whatsapp_status', (data) => {
    console.log("Status update:", data);
    updateUI(data);
});

function updateUI(data) {
    if (data.status === 'CONNECTED') {
        badge.className = 'status-badge status-connected';
        pulse.className = 'pulse connected';
        connText.textContent = 'Connected';
        
        qrSection.style.display = 'none';
        profileSection.style.display = 'block';
        btnTest.disabled = false;
        
        profileName.textContent = data.name || 'Unknown User';
        profilePhone.textContent = data.phone ? `+${data.phone}` : '-';
        if (data.lastConnected) {
            lastConnected.textContent = new Date(data.lastConnected).toLocaleString();
        }
    } else if (data.status === 'QR_READY') {
        badge.className = 'status-badge status-disconnected';
        pulse.className = 'pulse disconnected';
        connText.textContent = 'Awaiting Scan';
        
        profileSection.style.display = 'none';
        qrSection.style.display = 'block';
        btnTest.disabled = true;
        
        if (data.qrImage) {
            qrLoading.style.display = 'none';
            qrImg.src = data.qrImage;
            qrImg.style.display = 'inline-block';
        }
    } else {
        badge.className = 'status-badge status-disconnected';
        pulse.className = 'pulse disconnected';
        connText.textContent = 'Disconnected';
        
        profileSection.style.display = 'none';
        qrSection.style.display = 'block';
        qrImg.style.display = 'none';
        qrLoading.style.display = 'block';
        btnTest.disabled = true;
    }
}

async function sendTestMessage(e) {
    e.preventDefault();
    const phone = document.getElementById('test-phone').value;
    
    showLoader(true);
    try {
        const res = await fetch('/api/whatsapp/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });
        const data = await res.json();
        showLoader(false);
        
        if (data.success) {
            Swal.fire('Sent!', 'Test message sent successfully.', 'success');
            document.getElementById('test-phone').value = '';
        } else {
            Swal.fire('Error', data.message || 'Failed to send message', 'error');
        }
        fetchLogs();
    } catch (err) {
        showLoader(false);
        Swal.fire('Error', 'Could not reach server', 'error');
    }
}

async function logoutWhatsApp() {
    Swal.fire({
        title: 'Are you sure?',
        text: "This will disconnect the current WhatsApp session.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EF4444',
        cancelButtonColor: '#64748B',
        confirmButtonText: 'Yes, unlink it!'
    }).then(async (result) => {
        if (result.isConfirmed) {
            showLoader(true);
            try {
                await fetch('/api/whatsapp/logout', { method: 'POST' });
                showLoader(false);
                // The socket will automatically broadcast DISCONNECTED state
            } catch (err) {
                showLoader(false);
            }
        }
    });
}

async function fetchLogs() {
    try {
        const res = await fetch('/api/whatsapp/logs');
        const json = await res.json();
        
        if (json.success && json.data) {
            const tbody = document.getElementById('logs-body');
            tbody.innerHTML = '';
            
            if (json.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="text-center text-secondary py-3">No logs available</td></tr>';
            } else {
                let sentCount = 0;
                let failedCount = 0;
                
                // Show latest first
                const reversed = [...json.data].reverse();
                reversed.forEach(log => {
                    if (log.status === 'SENT') sentCount++;
                    if (log.status === 'FAILED') failedCount++;
                    
                    const time = new Date(log.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    const badgeClass = log.status === 'SENT' ? 'bg-success' : 'bg-danger';
                    
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="small text-secondary">${time}</td>
                        <td class="small">${log.phone}</td>
                        <td><span class="badge ${badgeClass} text-white">${log.status}</span></td>
                    `;
                    tbody.appendChild(tr);
                });
                
                document.getElementById('stat-sent').textContent = sentCount;
                document.getElementById('stat-failed').textContent = failedCount;
            }
        }
    } catch (err) {
        console.error("Error fetching logs:", err);
    }
}

function showLoader(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

// Initial fetch
fetchLogs();
