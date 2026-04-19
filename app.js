// 로또 분석 및 추천 시스템
class LottoAnalyzer {
    constructor() {
        this.lottoData = [];
        this.frequency = {};
        this.allNumbers = Array.from({length: 45}, (_, i) => i + 1);
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
            [1, 5, 12, 23, 34, 42],
            [2, 8, 15, 28, 38, 43],
            [3, 9, 18, 31, 39, 44],
            [4, 11, 20, 32, 40, 45],
            [5, 13, 22, 35, 41, 7],
            [6, 14, 25, 36, 6, 8],
            [7, 16, 26, 37, 11, 19],
            [8, 17, 27, 33, 12, 24],
            [9, 19, 29, 34, 13, 30],
            [10, 21, 30, 35, 14, 21],
            [1, 6, 15, 28, 40, 43],
            [2, 7, 16, 29, 41, 44],
            [3, 8, 17, 30, 42, 45],
            [4, 9, 18, 31, 9, 10],
            [5, 10, 19, 32, 23, 26],
            [6, 11, 20, 33, 24, 28],
            [7, 12, 21, 34, 25, 32],
            [8, 13, 22, 35, 27, 38],
            [9, 14, 23, 36, 29, 39],
            [10, 15, 24, 37, 31, 40]
        ];
    }

    // 로또 데이터 분석
    async analyze() {
        this.lottoData = await this.fetchLottoData();
        this.calculateFrequency();
        return this.getAnalysisResult();
    }

    // 빈도수 계산
    calculateFrequency() {
        this.frequency = {};
        this.allNumbers.forEach(num => {
            this.frequency[num] = 0;
        });

        this.lottoData.forEach(draw => {
            if (Array.isArray(draw)) {
                draw.forEach(num => {
                    if (this.frequency.hasOwnProperty(num)) {
                        this.frequency[num]++;
                    }
                });
            }
        });
    }

    // 분석 결과 반환
    getAnalysisResult() {
        const sortedByFrequency = Object.entries(this.frequency)
            .sort((a, b) => b[1] - a[1])
            .map(([num, freq]) => ({ num: parseInt(num), freq }));

        const frequentNumbers = sortedByFrequency.slice(0, 10).map(item => item.num);
        const missingNumbers = sortedByFrequency
            .filter(item => item.freq === 0)
            .map(item => item.num);

        return {
            frequentNumbers,
            missingNumbers,
            frequency: this.frequency,
            sortedByFrequency
        };
    }

    // 10가지 추천 방법
    generateRecommendations(analysis) {
        const recommendations = [];

        // 1. 가장 자주 나온 번호들 (상위 6개)
        recommendations.push({
            title: '① 최고 인기 번호들',
            description: '가장 자주 나온 상위 6개 번호',
            numbers: analysis.sortedByFrequency.slice(0, 6).map(item => item.num)
        });

        // 2. 중간 정도 나온 번호들
        const midRange = analysis.sortedByFrequency.slice(5, 15);
        recommendations.push({
            title: '② 중간 인기 번호들',
            description: '중간 정도 자주 나온 번호들',
            numbers: this.selectRandom(midRange.map(item => item.num), 6)
        });

        // 3. 아예 나오지 않은 번호 포함
        recommendations.push({
            title: '③ 미사용 번호 포함',
            description: '나오지 않은 번호를 포함한 추천',
            numbers: this.combineNumbers(
                analysis.sortedByFrequency.slice(0, 3).map(item => item.num),
                analysis.missingNumbers.slice(0, 3)
            )
        });

        // 4. 홀수/짝수 균형
        recommendations.push({
            title: '④ 홀수/짝수 균형',
            description: '홀수 3개, 짝수 3개로 균형',
            numbers: this.balanceOddEven(analysis.sortedByFrequency.map(item => item.num))
        });

        // 5. 낮은 번호/높은 번호 균형
        recommendations.push({
            title: '⑤ 번호 범위 균형',
            description: '1~22: 3개, 23~45: 3개',
            numbers: this.balanceLowHigh(analysis.sortedByFrequency.map(item => item.num))
        });

        // 6. 최근 회차 많이 나온 번호들
        const recentData = this.lottoData.slice(-7);
        const recentFreq = {};
        recentData.forEach(draw => {
            if (Array.isArray(draw)) {
                draw.forEach(num => {
                    recentFreq[num] = (recentFreq[num] || 0) + 1;
                });
            }
        });
        const recentSorted = Object.entries(recentFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(item => parseInt(item[0]));
        recommendations.push({
            title: '⑥ 최근 인기 번호들',
            description: '최근 7회차에서 자주 나온 번호',
            numbers: recentSorted.length === 6 ? recentSorted : 
                     this.padNumbers(recentSorted, analysis.sortedByFrequency.map(item => item.num))
        });

        // 7. 이전 회차 많이 나온 번호들
        const previousData = this.lottoData.slice(0, 7);
        const previousFreq = {};
        previousData.forEach(draw => {
            if (Array.isArray(draw)) {
                draw.forEach(num => {
                    previousFreq[num] = (previousFreq[num] || 0) + 1;
                });
            }
        });
        const previousSorted = Object.entries(previousFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(item => parseInt(item[0]));
        recommendations.push({
            title: '⑦ 과거 인기 번호들',
            description: '처음 7회차에서 자주 나온 번호',
            numbers: previousSorted.length === 6 ? previousSorted : 
                     this.padNumbers(previousSorted, analysis.sortedByFrequency.map(item => item.num))
        });

        // 8. 분산된 번호들 (넓게 퍼진)
        recommendations.push({
            title: '⑧ 분산된 번호',
            description: '1~45 범위에 고르게 분산',
            numbers: this.selectDistributed()
        });

        // 9. 클러스터 번호들 (가까운 번호들)
        recommendations.push({
            title: '⑨ 클러스터 번호',
            description: '비슷한 범위 번호들로 구성',
            numbers: this.selectClustered()
        });

        // 10. 랜덤 선택
        recommendations.push({
            title: '⑩ 행운의 선택',
            description: '무작위 선택 (운에 맡기기)',
            numbers: this.selectRandom(this.allNumbers, 6)
        });

        return recommendations;
    }

    // 도우미 함수들
    selectRandom(numbers, count) {
        const shuffled = [...numbers].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count).sort((a, b) => a - b);
    }

    combineNumbers(group1, group2) {
        return [...group1, ...group2].slice(0, 6).sort((a, b) => a - b);
    }

    balanceOddEven(numbers) {
        const odd = numbers.filter(n => n % 2 === 1).slice(0, 3);
        const even = numbers.filter(n => n % 2 === 0).slice(0, 3);
        return [...odd, ...even].slice(0, 6).sort((a, b) => a - b);
    }

    balanceLowHigh(numbers) {
        const low = numbers.filter(n => n <= 22).slice(0, 3);
        const high = numbers.filter(n => n > 22).slice(0, 3);
        return [...low, ...high].slice(0, 6).sort((a, b) => a - b);
    }

    selectDistributed() {
        const result = [];
        const step = 45 / 6;
        for (let i = 0; i < 6; i++) {
            const min = Math.floor(i * step) + 1;
            const max = Math.floor((i + 1) * step);
            const range = Array.from({length: max - min + 1}, (_, j) => min + j);
            const selected = range[Math.floor(Math.random() * range.length)];
            result.push(selected);
        }
        return result.sort((a, b) => a - b);
    }

    selectClustered() {
        const result = [];
        const clusters = [
            [1, 10],
            [11, 20],
            [21, 30],
            [31, 40],
            [41, 45]
        ];
        
        // 5개 클러스터에서 각각 1-2개씩
        for (let i = 0; i < 5 && result.length < 6; i++) {
            const [min, max] = clusters[i];
            const range = Array.from({length: max - min + 1}, (_, j) => min + j);
            const selected = range[Math.floor(Math.random() * range.length)];
            result.push(selected);
        }
        
        if (result.length < 6) {
            result.push(this.selectRandom(this.allNumbers, 1)[0]);
        }
        
        return result.sort((a, b) => a - b);
    }

    padNumbers(numbers, fallback) {
        if (numbers.length === 6) return numbers;
        const needed = 6 - numbers.length;
        const additional = fallback
            .filter(n => !numbers.includes(n))
            .slice(0, needed);
        return [...numbers, ...additional].sort((a, b) => a - b);
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
        displayFrequentNumbers(analysis.frequentNumbers);
        displayMissingNumbers(analysis.missingNumbers);
        analysisResult.style.display = 'block';

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

function displayFrequentNumbers(numbers) {
    frequentNumbersDiv.innerHTML = numbers
        .map(num => `<span class="number-tag">${num}</span>`)
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

function displayRecommendations(recommendations) {
    recommendationsGrid.innerHTML = recommendations
        .map(rec => `
            <div class="recommendation-card">
                <h4>${rec.title}</h4>
                <div class="recommendation-numbers">
                    ${rec.numbers.map(num => `<div class="lotto-number">${num}</div>`).join('')}
                </div>
                <div class="recommendation-description">${rec.description}</div>
            </div>
        `)
        .join('');
}
