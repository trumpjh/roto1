// 로또 분석 및 추천 시스템
class LottoAnalyzer {
    constructor() {
        this.lottoData = [];
        this.recentLottoData = [];
        this.frequency = {};
        this.allNumbers = Array.from({length: 45}, (_, i) => i + 1);
        this.frequentNumbers = [];
        this.normalNumbers = [];
        this.missingNumbers = [];
    }

    // 외부 API에서 로또 번호 데이터 가져오기
    async fetchLottoData() {
        try {
            // 먼저 로컬 백업 데이터 시도
            const response = await fetch('lotto-data.json');
            if (response.ok) {
                const data = await response.json();
                console.log('로컬 데이터 로드 성공');
                return data;
            }
        } catch (error) {
            console.log('로컬 데이터 로드 실패, 외부 API 시도:', error);
        }

        try {
            // 외부 API 시도
            const response = await fetch('https://trumpjh.github.io/roto/data/lotto.json');
            if (response.ok) {
                const data = await response.json();
                console.log('외부 API 데이터 로드 성공');
                return data;
            }
        } catch (error) {
            console.log('외부 API 로드 실패:', error);
        }

        // 모두 실패하면 샘플 데이터 사용
        console.log('샘플 데이터 사용');
        return this.getSampleData();
    }

    // 샘플 데이터 (테스트용)
    getSampleData() {
        return [
            [7, 14, 18, 23, 31, 42],
            [11, 16, 25, 32, 38, 44],
            [3, 9, 17, 28, 35, 43],
            [2, 12, 21, 34, 39, 45],
            [5, 13, 26, 33, 40, 8],
            [4, 15, 22, 29, 36, 41],
            [1, 19, 27, 30, 37, 6],
            [8, 20, 24, 31, 38, 10],
            [6, 14, 28, 35, 42, 44],
            [9, 16, 23, 32, 39, 43],
            [2, 11, 25, 34, 40, 45],
            [3, 13, 27, 36, 41, 7],
            [5, 18, 29, 37, 12, 21],
            [4, 17, 30, 38, 44, 15],
            [1, 22, 33, 39, 11, 26],
            [10, 19, 24, 28, 35, 42],
            [8, 14, 31, 40, 43, 6],
            [7, 16, 25, 32, 37, 45],
            [9, 20, 27, 34, 38, 13],
            [2, 23, 29, 36, 41, 12]
        ];
    }

    // 로또 데이터 분석
    async analyze() {
        this.lottoData = await this.fetchLottoData();
        // 최근 20회차만 사용
        this.recentLottoData = this.lottoData.slice(-20);
        this.calculateFrequency();
        return this.getAnalysisResult();
    }

    // 빈도수 계산 (최근 20회차 기준)
    calculateFrequency() {
        this.frequency = {};
        this.allNumbers.forEach(num => {
            this.frequency[num] = 0;
        });

        this.recentLottoData.forEach(draw => {
            if (Array.isArray(draw)) {
                draw.forEach(num => {
                    if (this.frequency.hasOwnProperty(num)) {
                        this.frequency[num]++;
                    }
                });
            }
        });

        // 번호를 3가지 카테고리로 분류
        const sortedByFrequency = Object.entries(this.frequency)
            .sort((a, b) => b[1] - a[1])
            .map(([num, freq]) => ({ num: parseInt(num), freq }));

        // 자주 나온 번호 (상위 12개)
        this.frequentNumbers = sortedByFrequency.slice(0, 12).map(item => item.num);
        
        // 나오지 않은 번호 (0회)
        this.missingNumbers = sortedByFrequency
            .filter(item => item.freq === 0)
            .map(item => item.num);
        
        // 보통으로 나온 번호 (나머지 중에서)
        this.normalNumbers = sortedByFrequency
            .slice(12)
            .filter(item => item.freq > 0)
            .map(item => item.num);
    }

    // 분석 결과 반환
    getAnalysisResult() {
        return {
            frequentNumbers: this.frequentNumbers,
            missingNumbers: this.missingNumbers,
            normalNumbers: this.normalNumbers,
            frequency: this.frequency,
            recentDataCount: this.recentLottoData.length
        };
    }

    // 열별 분석
    analyzeByColumns() {
        const columns = [
            { name: '1열', range: [1, 7] },
            { name: '2열', range: [8, 14] },
            { name: '3열', range: [15, 21] },
            { name: '4열', range: [22, 28] },
            { name: '5열', range: [29, 35] },
            { name: '6열', range: [36, 42] },
            { name: '7열', range: [43, 45] }
        ];

        const columnAnalysis = columns.map(col => {
            const [start, end] = col.range;
            const columnNumbers = Array.from({length: end - start + 1}, (_, i) => start + i);
            
            // 각 열의 번호별 빈도수 계산
            const columnFrequency = {};
            columnNumbers.forEach(num => {
                columnFrequency[num] = this.frequency[num] || 0;
            });

            // 빈도수 기준 정렬
            const sortedByFreq = Object.entries(columnFrequency)
                .sort((a, b) => b[1] - a[1])
                .map(([num, freq]) => ({ num: parseInt(num), freq }));

            // 통계 계산
            const frequencies = Object.values(columnFrequency);
            const totalFreq = frequencies.reduce((a, b) => a + b, 0);
            const avgFreq = totalFreq / frequencies.length;
            const maxFreq = Math.max(...frequencies);
            const minFreq = Math.min(...frequencies);

            return {
                name: col.name,
                numbers: columnNumbers,
                frequency: columnFrequency,
                sortedByFreq: sortedByFreq,
                totalFreq: totalFreq,
                avgFreq: avgFreq.toFixed(2),
                maxFreq: maxFreq,
                minFreq: minFreq,
                topNumber: sortedByFreq[0],
                topThree: sortedByFreq.slice(0, 3)
            };
        });

        return columnAnalysis;
    }

    // 10가지 추천 번호 생성 (정교한 조합)
    generateRecommendations(analysis) {
        const recommendations = [];
        const usedCombinations = new Set();
        const allAvailable = [
            ...analysis.frequentNumbers,
            ...analysis.normalNumbers,
            ...analysis.missingNumbers
        ].filter((v, i, a) => a.indexOf(v) === i); // 중복 제거

        // 10개의 서로 다른 추천 생성
        for (let i = 0; i < 10; i++) {
            let recommendation;
            let attempts = 0;

            // 중복되지 않는 조합 찾기
            do {
                const frequentCount = Math.min(3 + Math.floor(Math.random() * 2), analysis.frequentNumbers.length);
                const missingCount = Math.min(
                    2 + Math.floor(Math.random() * 2), 
                    analysis.missingNumbers.length,
                    6 - frequentCount
                );
                const normalCount = 6 - frequentCount - missingCount;

                let selectedFrequent = this.selectRandomDistinct(analysis.frequentNumbers, frequentCount);
                let selectedMissing = this.selectRandomDistinct(analysis.missingNumbers, missingCount);
                let selectedNormal = this.selectRandomDistinct(analysis.normalNumbers, normalCount);

                // 개수가 부족하면 다른 카테고리에서 채우기
                let total = selectedFrequent.length + selectedMissing.length + selectedNormal.length;
                
                if (total < 6) {
                    const remaining = 6 - total;
                    const available = allAvailable.filter(n => 
                        !selectedFrequent.includes(n) && 
                        !selectedMissing.includes(n) && 
                        !selectedNormal.includes(n)
                    );
                    const additional = this.selectRandomDistinct(available, remaining);
                    selectedNormal = [...selectedNormal, ...additional];
                }

                const numbers = [...selectedFrequent, ...selectedMissing, ...selectedNormal]
                    .slice(0, 6)
                    .sort((a, b) => a - b);
                
                const comboKey = numbers.join(',');
                
                if (!usedCombinations.has(comboKey) && numbers.length === 6) {
                    usedCombinations.add(comboKey);
                    const actualFrequentCount = selectedFrequent.length;
                    const actualMissingCount = selectedMissing.length;
                    const actualNormalCount = numbers.length - actualFrequentCount - actualMissingCount;
                    
                    recommendation = {
                        title: `추천 ${i + 1}`,
                        numbers: numbers,
                        frequentCount: actualFrequentCount,
                        missingCount: actualMissingCount,
                        normalCount: actualNormalCount,
                        description: `자주나온: ${actualFrequentCount}개 | 미사용: ${actualMissingCount}개 | 보통: ${actualNormalCount}개`
                    };
                    break;
                }
                
                attempts++;
            } while (attempts < 50);

            if (recommendation) {
                recommendations.push(recommendation);
            }
        }

        return recommendations;
    }

    // 중복 없이 무작위 선택
    selectRandomDistinct(arr, count) {
        if (!arr || arr.length === 0 || count <= 0) return [];
        const selected = [];
        const available = [...arr];
        
        const actualCount = Math.min(count, available.length);
        for (let i = 0; i < actualCount; i++) {
            const idx = Math.floor(Math.random() * available.length);
            selected.push(available[idx]);
            available.splice(idx, 1);
        }
        
        return selected;
    }
}

// UI 제어
const analyzer = new LottoAnalyzer();
const loadBtn = document.getElementById('loadBtn');
const loadingDiv = document.getElementById('loading');
const analysisResult = document.getElementById('analysisResult');
const recommendationSection = document.getElementById('recommendationSection');
const frequentNumbersDiv = document.getElementById('frequentNumbers');
const missingNumbersDiv = document.getElementById('missingNumbers');
const recommendationsGrid = document.getElementById('recommendationsGrid');

loadBtn.addEventListener('click', async () => {
    loadBtn.style.display = 'none';
    loadingDiv.style.display = 'block';

    try {
        const analysis = await analyzer.analyze();
        
        // 분석 결과 표시
        displayAnalysisInfo(analysis);
        displayFrequentNumbers(analysis.frequentNumbers);
        displayMissingNumbers(analysis.missingNumbers);
        displayNormalNumbers(analysis.normalNumbers);
        analysisResult.style.display = 'block';

        // 열별 분석 결과 표시
        const columnAnalysis = analyzer.analyzeByColumns();
        displayColumnAnalysis(columnAnalysis);
        document.getElementById('columnAnalysisSection').style.display = 'block';

        // 추천 결과 표시
        const recommendations = analyzer.generateRecommendations(analysis);
        displayRecommendations(recommendations);
        recommendationSection.style.display = 'block';

    } catch (error) {
        console.error('오류 발생:', error);
        loadingDiv.innerHTML = '<p>❌ 데이터를 불러오는데 실패했습니다. 다시 시도해주세요.</p>';
    } finally {
        loadingDiv.style.display = 'none';
    }
});

function displayAnalysisInfo(analysis) {
    const infoDiv = document.getElementById('analysisInfo');
    if (infoDiv) {
        infoDiv.innerHTML = `
            <p><strong>📊 분석 기준:</strong> 최근 ${analysis.recentDataCount}회차 데이터</p>
            <p><strong>🔥 자주 나온 번호:</strong> ${analysis.frequentNumbers.length}개</p>
            <p><strong>❄️ 나오지 않은 번호:</strong> ${analysis.missingNumbers.length}개</p>
            <p><strong>⚪ 보통 나온 번호:</strong> ${analysis.normalNumbers.length}개</p>
        `;
    }
}

function displayFrequentNumbers(numbers) {
    frequentNumbersDiv.innerHTML = numbers
        .map(num => `<span class="number-tag frequent">${num}</span>`)
        .join('');
}

function displayMissingNumbers(numbers) {
    if (numbers.length === 0) {
        missingNumbersDiv.innerHTML = '<p style="color: #666;">모든 번호가 최소 1회 이상 나왔습니다.</p>';
    } else {
        missingNumbersDiv.innerHTML = numbers
            .map(num => `<span class="number-tag missing">${num}</span>`)
            .join('');
    }
}

function displayNormalNumbers(numbers) {
    const normalDiv = document.getElementById('normalNumbers');
    if (normalDiv) {
        if (numbers.length === 0) {
            normalDiv.innerHTML = '<p style="color: #666;">보통 나온 번호가 없습니다.</p>';
        } else {
            normalDiv.innerHTML = numbers
                .map(num => `<span class="number-tag normal">${num}</span>`)
                .join('');
        }
    }
}

function displayColumnAnalysis(columnAnalysis) {
    const columnGrid = document.getElementById('columnAnalysisGrid');
    if (!columnGrid) return;

    columnGrid.innerHTML = columnAnalysis
        .map(col => `
            <div class="column-box">
                <div class="column-header">
                    <h4>${col.name} <span class="range-info">(${col.numbers.join('-').split(',')[0]}-${col.numbers[col.numbers.length - 1]})</span></h4>
                </div>
                
                <div class="column-stats">
                    <div class="stat-item">
                        <span class="stat-label">전체 빈도:</span>
                        <span class="stat-value">${col.totalFreq}회</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">평균:</span>
                        <span class="stat-value">${col.avgFreq}회</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">최고:</span>
                        <span class="stat-value">${col.maxFreq}회</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">최저:</span>
                        <span class="stat-value">${col.minFreq}회</span>
                    </div>
                </div>

                <div class="column-top-numbers">
                    <h5>🔥 TOP 3 번호</h5>
                    <div class="top-numbers-display">
                        ${col.topThree.map((item, idx) => `
                            <div class="top-number-item">
                                <div class="rank-badge">${idx + 1}</div>
                                <div class="number-circle">${item.num}</div>
                                <div class="frequency-text">${item.freq}회</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="column-all-numbers">
                    <h5>📊 모든 번호 (빈도순)</h5>
                    <div class="all-numbers-list">
                        ${col.sortedByFreq.map(item => `
                            <div class="number-freq-item" title="${item.num}번: ${item.freq}회">
                                <span class="freq-num">${item.num}</span>
                                <span class="freq-bar" style="width: ${(item.freq / col.maxFreq) * 100}%"></span>
                                <span class="freq-count">${item.freq}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `)
        .join('');
}

function displayRecommendations(recommendations) {
    recommendationsGrid.innerHTML = recommendations
        .map((rec, idx) => `
            <div class="recommendation-card">
                <h4>${rec.title}</h4>
                <div class="combination-info">
                    <span class="combo-badge frequent">자주: ${rec.frequentCount}</span>
                    <span class="combo-badge missing">미사용: ${rec.missingCount}</span>
                    <span class="combo-badge normal">보통: ${rec.normalCount}</span>
                </div>
                <div class="recommendation-numbers">
                    ${rec.numbers.map(num => `<div class="lotto-number">${num}</div>`).join('')}
                </div>
                <div class="recommendation-description">${rec.description}</div>
            </div>
        `)
        .join('');
}

// 스크린샷 함수
function captureScreenshot() {
    const element = document.getElementById('recommendationSection');
    if (!element) {
        alert('추천 번호 섹션을 찾을 수 없습니다.');
        return;
    }

    // html2canvas 라이브러리 사용
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    script.onload = function() {
        html2canvas(element, {
            backgroundColor: '#ffffff',
            scale: 2,
            logging: false,
            allowTaint: true,
            useCORS: true
        }).then(canvas => {
            // 이미지 다운로드
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/png');
            link.download = `로또추천_${new Date().toISOString().slice(0, 10)}.png`;
            link.click();
            alert('✅ 이미지가 저장되었습니다!');
        }).catch(err => {
            console.error('스크린샷 오류:', err);
            alert('❌ 스크린샷 저장에 실패했습니다.');
        });
    };
    document.head.appendChild(script);
}
