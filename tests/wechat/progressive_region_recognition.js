/**
 * 渐进式区域识别
 *
 * 核心思想：
 * 1. 第一次识别：获取初步区域
 * 2. Agent 判断：分析哪些区域识别正确，哪些需要继续分割
 * 3. 第二次识别：对需要细分的区域进行局部识别
 * 4. 合并结果：组合所有识别结果
 *
 * 判断标准：
 * - 区域面积是否合理
 * - 区域颜色是否单一
 * - 区域是否包含明显的内部结构
 */

class ProgressiveRegionRecognition {
    /**
     * 阶段 1: 初步识别
     */
    async initialRecognition(imagePath, options = {}) {
        console.log('\n阶段 1: 初步识别');
        console.log('-'.repeat(80));

        const result = await Vision.analyzeLayout({
            imagePath,
            cellSize: options.cellSize || 10,
            quantize: options.quantize || 16,
            tolerance: options.tolerance || 32,
            minRegionArea: options.minRegionArea || 4,
            minSeparatorScore: options.minSeparatorScore || 0.08,
            cellColorMode: options.cellColorMode || 'median',
            boundarySpanWidth: options.boundarySpanWidth || 3,
            separatorHints: options.separatorHints
        });

        console.log(`  识别到 ${result.regions.length} 个区域`);

        return {
            imagePath,
            regions: result.regions,
            separators: result.separators,
            imageWidth: result.width,
            imageHeight: result.height
        };
    }

    /**
     * 阶段 2: 智能判断哪些区域需要继续分割
     */
    analyzeRegions(recognitionResult) {
        console.log('\n阶段 2: 分析区域质量');
        console.log('-'.repeat(80));

        const { regions, imageWidth, imageHeight } = recognitionResult;
        const totalArea = imageWidth * imageHeight;

        const analyzed = regions.map(region => {
            const bbox = region.bbox;
            const area = bbox.width * bbox.height;
            const areaRatio = area / totalArea;

            // 判断标准
            const criteria = {
                // 1. 面积是否过大（可能需要继续分割）
                tooLarge: areaRatio > 0.4,  // 超过 40% 的区域可能需要分割

                // 2. 宽高比是否异常
                aspectRatio: bbox.width / bbox.height,
                aspectRatioOdd: (bbox.width / bbox.height > 5) || (bbox.height / bbox.width > 5),

                // 3. 区域位置（边缘区域通常是正确的）
                isEdge: bbox.x === 0 || bbox.y === 0 ||
                        (bbox.x + bbox.width >= imageWidth * 0.95) ||
                        (bbox.y + bbox.height >= imageHeight * 0.95),

                // 4. 区域大小
                area,
                areaRatio
            };

            // 综合判断是否需要继续分割
            const needsSubdivision =
                criteria.tooLarge &&
                !criteria.isEdge &&
                !criteria.aspectRatioOdd;

            return {
                region,
                criteria,
                needsSubdivision,
                confidence: this.calculateRegionConfidence(criteria)
            };
        });

        const needSubdivision = analyzed.filter(a => a.needsSubdivision);
        const confirmed = analyzed.filter(a => !a.needsSubdivision);

        console.log(`  确认正确: ${confirmed.length} 个区域`);
        confirmed.forEach(a => {
            console.log(`    ✓ ${a.region.id}: (${a.region.bbox.x}, ${a.region.bbox.y}, ${a.region.bbox.width}, ${a.region.bbox.height}) - 置信度: ${a.confidence.toFixed(2)}`);
        });

        console.log(`  需要细分: ${needSubdivision.length} 个区域`);
        needSubdivision.forEach(a => {
            console.log(`    ⚠ ${a.region.id}: (${a.region.bbox.x}, ${a.region.bbox.y}, ${a.region.bbox.width}, ${a.region.bbox.height}) - 面积占比: ${(a.criteria.areaRatio * 100).toFixed(1)}%`);
        });

        return {
            confirmed,
            needSubdivision,
            all: analyzed
        };
    }

    /**
     * 计算区域置信度
     */
    calculateRegionConfidence(criteria) {
        let confidence = 1.0;

        // 面积过大降低置信度
        if (criteria.tooLarge) {
            confidence -= 0.4;
        }

        // 宽高比异常降低置信度
        if (criteria.aspectRatioOdd) {
            confidence -= 0.2;
        }

        // 边缘区域提高置信度
        if (criteria.isEdge) {
            confidence += 0.2;
        }

        return Math.max(0, Math.min(1, confidence));
    }

    /**
     * 阶段 3: 对需要细分的区域进行局部识别
     */
    async subdivideRegions(imagePath, regionsToSubdivide, options = {}) {
        console.log('\n阶段 3: 细分大区域');
        console.log('-'.repeat(80));

        const subdivided = [];

        for (const analyzed of regionsToSubdivide) {
            const region = analyzed.region;
            const bbox = region.bbox;

            console.log(`\n  细分区域: ${region.id} (${bbox.x}, ${bbox.y}, ${bbox.width}, ${bbox.height})`);

            // 策略 1: 尝试使用更严格的参数
            const subResult = await Vision.analyzeLayout({
                imagePath,
                cellSize: 5,  // 更小的网格
                quantize: 8,  // 更细的量化
                tolerance: 20,  // 更小的容差
                minRegionArea: 2,
                minSeparatorScore: 0.05,  // 更低的阈值
                cellColorMode: 'median',
                boundarySpanWidth: 3,
                // 限制识别范围到这个区域
                cropRect: {
                    x: bbox.x,
                    y: bbox.y,
                    width: bbox.width,
                    height: bbox.height
                }
            });

            // 过滤出在这个区域内的子区域
            const subRegions = subResult.regions.filter(r => {
                return r.bbox.x >= bbox.x &&
                       r.bbox.y >= bbox.y &&
                       (r.bbox.x + r.bbox.width) <= (bbox.x + bbox.width) &&
                       (r.bbox.y + r.bbox.height) <= (bbox.y + bbox.height);
            });

            console.log(`    → 细分为 ${subRegions.length} 个子区域`);
            subRegions.forEach((r, i) => {
                console.log(`      ${i + 1}. (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height}) - ${r.avgColor}`);
            });

            subdivided.push({
                original: region,
                subRegions: subRegions.length > 1 ? subRegions : [region]  // 如果没有细分成功，保留原区域
            });
        }

        return subdivided;
    }

    /**
     * 阶段 4: 合并所有结果
     */
    mergeResults(confirmed, subdivided) {
        console.log('\n阶段 4: 合并结果');
        console.log('-'.repeat(80));

        const finalRegions = [];

        // 添加确认的区域
        confirmed.forEach(a => {
            finalRegions.push(a.region);
        });

        // 添加细分后的区域
        subdivided.forEach(s => {
            s.subRegions.forEach(r => {
                finalRegions.push(r);
            });
        });

        console.log(`  最终区域数量: ${finalRegions.length}`);
        finalRegions.forEach((r, i) => {
            console.log(`    ${i + 1}. ${r.id}: (${r.bbox.x}, ${r.bbox.y}, ${r.bbox.width}, ${r.bbox.height}) - ${r.avgColor}`);
        });

        return finalRegions;
    }

    /**
     * 完整的渐进式识别流程
     */
    async recognize(imagePath, options = {}) {
        console.log('='.repeat(80));
        console.log('渐进式区域识别');
        console.log('='.repeat(80));

        // 阶段 1: 初步识别
        const initial = await this.initialRecognition(imagePath, options);

        // 阶段 2: 分析区域质量
        const analysis = this.analyzeRegions(initial);

        // 阶段 3: 细分需要的区域
        let subdivided = [];
        if (analysis.needSubdivision.length > 0) {
            subdivided = await this.subdivideRegions(
                imagePath,
                analysis.needSubdivision,
                options
            );
        }

        // 阶段 4: 合并结果
        const finalRegions = this.mergeResults(analysis.confirmed, subdivided);

        return {
            regions: finalRegions,
            metadata: {
                initialCount: initial.regions.length,
                confirmedCount: analysis.confirmed.length,
                subdividedCount: analysis.needSubdivision.length,
                finalCount: finalRegions.length
            }
        };
    }
}

// 测试渐进式识别
async function testProgressiveRecognition() {
    console.log('='.repeat(80));
    console.log('测试渐进式区域识别');
    console.log('='.repeat(80));

    const progressive = new ProgressiveRegionRecognition();

    // 测试复杂场景
    const result = await progressive.recognize('.runtime/tests/wechat/mock_wechat.png', {
        cellSize: 10,
        quantize: 16,
        tolerance: 32,
        minRegionArea: 4,
        minSeparatorScore: 0.08,
        cellColorMode: 'median',
        boundarySpanWidth: 3
    });

    console.log('\n' + '='.repeat(80));
    console.log('识别结果统计');
    console.log('='.repeat(80));
    console.log(`  初始识别: ${result.metadata.initialCount} 个区域`);
    console.log(`  确认正确: ${result.metadata.confirmedCount} 个区域`);
    console.log(`  需要细分: ${result.metadata.subdividedCount} 个区域`);
    console.log(`  最终结果: ${result.metadata.finalCount} 个区域`);

    // 生成可视化
    console.log('\n生成可视化图片...');
    const annotated = await Vision.annotateRegions({
        imagePath: '.runtime/tests/wechat/mock_wechat.png',
        regions: result.regions,
        outputPath: '.runtime/tests/wechat/progressive_regions_annotated.png',
        title: 'Progressive Recognition'
    });

    console.log(`✓ 已生成: ${annotated.outputPath}`);
    console.log('\n查看结果:');
    console.log('  open .runtime/tests/wechat/progressive_regions_annotated.png');
}

testProgressiveRecognition().catch(console.error);
