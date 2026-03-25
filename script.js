let chart1, chart2, chart3, chart4;

// Logic for adding Lump Sum fields
document.getElementById('addLumpBtn').addEventListener('click', () => {
    const container = document.getElementById('lumpSumContainer');
    const div = document.createElement('div');
    div.className = 'input-group';
    div.style.padding = "10px";
    div.style.background = "#f1f5f9";
    div.style.borderRadius = "8px";
    div.style.marginBottom = "10px";
    div.innerHTML = `
      <label>One-time ($)</label>
      <input class="lumpSumAmount" type="number" value="0">
      <label>Month</label>
      <input class="lumpSumMonth" type="number" min="1" value="2">
      <button type="button" class="removeLump" style="margin-top:5px; width:100%; font-size:10px;">Remove</button>
    `;
    div.querySelector('.removeLump').addEventListener('click', () => div.remove());
    container.appendChild(div);
});

document.getElementById('addMultiLumpBtn').addEventListener('click', () => {
    const container = document.getElementById('multiLumpContainer');
    const div = document.createElement('div');
    div.className = 'input-group';
    div.style.padding = "10px";
    div.style.background = "#f1f5f9";
    div.style.borderRadius = "8px";
    div.style.marginBottom = "10px";
    div.innerHTML = `
      <label>Multi-month ($)</label>
      <input class="multiLumpAmount" type="number" value="0">
      <label>Months (e.g. 12, 24)</label>
      <input class="multiLumpMonths" type="text" value="">
      <button type="button" class="removeMultiLump" style="margin-top:5px; width:100%; font-size:10px;">Remove</button>
    `;
    div.querySelector('.removeMultiLump').addEventListener('click', () => div.remove());
    container.appendChild(div);
});

// MATH ENGINES
function amortizationScheduleWithTenures(principal, ratePct, termYears, options) {
    const monthlyRate = ratePct / 100 / 12;
    const totalMonths = termYears * 12;
    let monthlyPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));
    let balance = principal;

    const lumpMap = {};
    const lumpsFromDom = Array.from(document.getElementsByClassName('lumpSumAmount'));
    const monthsFromDom = Array.from(document.getElementsByClassName('lumpSumMonth'));
    lumpsFromDom.forEach((el, i) => {
        const amt = parseFloat(el.value) || 0;
        const mon = parseInt(monthsFromDom[i]?.value) || 0;
        if (amt > 0 && mon > 0) lumpMap[mon] = (lumpMap[mon] || 0) + amt;
    });

    const multiAmounts = Array.from(document.getElementsByClassName('multiLumpAmount'));
    const multiMonthsInputs = Array.from(document.getElementsByClassName('multiLumpMonths'));
    multiAmounts.forEach((el, i) => {
        const amt = parseFloat(el.value) || 0;
        const monthsStr = multiMonthsInputs[i]?.value || '';
        if (amt > 0 && monthsStr) {
            monthsStr.split(',').forEach(part => {
                const mon = parseInt(part.trim()) || 0;
                if (mon > 0) lumpMap[mon] = (lumpMap[mon] || 0) + amt;
            });
        }
    });

    const schedule = [];
    let didRecast = false;
    let postRecastMonthly = null;

    for (let m = 1; m <= totalMonths && balance > 0.0005; m++) {
        const interest = balance * monthlyRate;
        let extraMonthly = (m <= options.livMonths ? options.livExtra : 0) + 
                           (m <= options.jcMonths ? options.jcExtra : 0);
        if (m > Math.max(options.livMonths, options.jcMonths)) extraMonthly += options.remainingExtra;

        let payment = monthlyPayment + extraMonthly;
        let principalPaid = Math.min(payment - interest, balance);
        balance -= principalPaid;

        if (lumpMap[m]) {
            const appliedLump = Math.min(lumpMap[m], balance);
            balance -= appliedLump;
        }

        if (options.autoRecast && !didRecast && options.livMonths > 0 && m === options.livMonths) {
            const rem = totalMonths - m;
            monthlyPayment = rem > 0 && balance > 0 ? (balance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -rem)) : 0;
            postRecastMonthly = monthlyPayment;
            didRecast = true;
        }

        schedule.push({ month: m, interest, principal: principalPaid, balance: Math.max(0, balance) });
        if (balance <= 0.0005) break;
    }
    return { schedule, didRecast, postRecastMonthly };
}

function amortizationScheduleNormal(principal, ratePct, termYears) {
    const monthlyRate = ratePct / 100 / 12;
    const totalMonths = termYears * 12;
    const monthlyPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -totalMonths));
    let balance = principal;
    const schedule = [];
    for (let m = 1; m <= totalMonths && balance > 0.0005; m++) {
        const interest = balance * monthlyRate;
        const principalPaid = Math.min(monthlyPayment - interest, balance);
        balance -= principalPaid;
        schedule.push({ month: m, interest, principal: principalPaid, balance: Math.max(0, balance) });
    }
    return schedule;
}

// CHARTING
function drawChart(canvasId, data, title) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const charts = { chartNormal: chart1, chartAccelerated: chart2 };
    if (charts[canvasId]) charts[canvasId].destroy();

    const newChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.month),
            datasets: [
                { label: 'Principal', data: data.map(d => d.principal), borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.3 },
                { label: 'Interest', data: data.map(d => d.interest), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', fill: true, tension: 0.3 }
            ]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });

    if (canvasId === 'chartNormal') chart1 = newChart;
    else chart2 = newChart;
}

function drawCumulativeInterestChart(normal, accelerated) {
    const ctx = document.getElementById('chartCumulativeInterest').getContext('2d');
    if (chart3) chart3.destroy();
    let cN = 0, cA = 0;
    const max = Math.max(normal.length, accelerated.length);
    const dataN = [], dataA = [], labels = [];
    for(let i=0; i<max; i++) {
        if(i < normal.length) cN += normal[i].interest;
        if(i < accelerated.length) cA += accelerated[i].interest;
        labels.push(i+1); dataN.push(cN); dataA.push(cA);
    }
    chart3 = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Normal', data: dataN, borderColor: '#ef4444', tension: 0.3 },
                { label: 'Accelerated', data: dataA, borderColor: '#2563eb', tension: 0.3 }
            ]
        },
        options: { responsive: true }
    });
}

function drawCumulativeEquityChart(normal, accelerated, purchasePrice) {
    const ctx = document.getElementById('chartCumulativeEquity').getContext('2d');
    if (chart4) chart4.destroy();
    const max = Math.max(normal.length, accelerated.length);
    const dataN = [], dataA = [], labels = [];
    for(let i=0; i<max; i++) {
        dataN.push(purchasePrice - (i < normal.length ? normal[i].balance : 0));
        dataA.push(purchasePrice - (i < accelerated.length ? accelerated[i].balance : 0));
        labels.push(i+1);
    }
    chart4 = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Normal', data: dataN, borderColor: '#64748b', tension: 0.3 },
                { label: 'Accelerated', data: dataA, borderColor: '#10b981', tension: 0.3 }
            ]
        },
        options: { responsive: true }
    });
}

function calculate() {
    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value) || 0;
    const downPayment = parseFloat(document.getElementById('downPayment').value) || 0;
    const interestRate = parseFloat(document.getElementById('interestRate').value) || 6.125;
    const loanAmount = Math.max(0, purchasePrice - downPayment);

    const options = {
        livMonths: parseInt(document.getElementById('livTenure').value) || 0,
        jcMonths: parseInt(document.getElementById('jcTenure').value) || 0,
        livExtra: parseFloat(document.getElementById('livExtra').value) || 0,
        jcExtra: parseFloat(document.getElementById('jcExtra').value) || 0,
        remainingExtra: parseFloat(document.getElementById('remainingExtra').value) || 0,
        autoRecast: document.getElementById('postLivRecast').value === 'yes'
    };

    const normal = amortizationScheduleNormal(loanAmount, interestRate, 30);
    const accelData = amortizationScheduleWithTenures(loanAmount, interestRate, 30, options);
    const accelerated = accelData.schedule;

    const interestNormal = normal.reduce((s, r) => s + r.interest, 0);
    const interestAccel = accelerated.reduce((s, r) => s + r.interest, 0);
    
    const fmt = n => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    document.getElementById('results').innerHTML = `
        <div><strong>Months Saved:</strong><br>${normal.length - accelerated.length} months</div>
        <div><strong>Years Saved:</strong><br>${((normal.length - accelerated.length)/12).toFixed(1)} years</div>
        <div><strong>Interest Saved:</strong><br>$${fmt(interestNormal - interestAccel)}</div>
        <div><strong>Final Payoff:</strong><br>Month ${accelerated.length}</div>
    `;

    drawChart('chartNormal', normal, 'Normal');
    drawChart('chartAccelerated', accelerated, 'Accelerated');
    drawCumulativeInterestChart(normal, accelerated);
    drawCumulativeEquityChart(normal, accelerated, purchasePrice);
}

document.getElementById('calcBtn').addEventListener('click', calculate);
window.addEventListener('load', calculate);