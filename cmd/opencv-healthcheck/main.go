//go:build opencv

package main

import (
	"fmt"
	"math"
	"os"

	"gocv.io/x/gocv"
)

func main() {
	minScore, err := checkTemplateMatching()
	if err != nil {
		fmt.Fprintf(os.Stderr, "OpenCV health check failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("GoCV version: %s\n", gocv.Version())
	fmt.Printf("OpenCV version: %s\n", gocv.OpenCVVersion())
	fmt.Printf("Template matching minimum score: %.6f\n", minScore)
	fmt.Println("OpenCV health check: OK")
}

func checkTemplateMatching() (float32, error) {
	scene, err := gocv.NewMatFromBytes(5, 5, gocv.MatTypeCV8U, []byte{
		0, 0, 0, 0, 0,
		0, 10, 50, 0, 0,
		0, 30, 90, 0, 0,
		0, 0, 0, 0, 0,
		0, 0, 0, 0, 0,
	})
	if err != nil {
		return 0, fmt.Errorf("create scene matrix: %w", err)
	}
	defer scene.Close()

	template, err := gocv.NewMatFromBytes(2, 2, gocv.MatTypeCV8U, []byte{
		10, 50,
		30, 90,
	})
	if err != nil {
		return 0, fmt.Errorf("create template matrix: %w", err)
	}
	defer template.Close()

	result := gocv.NewMat()
	defer result.Close()
	mask := gocv.NewMat()
	defer mask.Close()

	gocv.MatchTemplate(scene, template, &result, gocv.TmSqdiffNormed, mask)
	if result.Empty() {
		return 0, fmt.Errorf("template matching returned an empty result")
	}

	minScore, _, minLocation, _ := gocv.MinMaxLoc(result)
	if math.IsNaN(float64(minScore)) || minScore > 0.0001 {
		return minScore, fmt.Errorf("unexpected match score %.6f at %v", minScore, minLocation)
	}
	if minLocation.X != 1 || minLocation.Y != 1 {
		return minScore, fmt.Errorf("unexpected match location %v", minLocation)
	}

	return minScore, nil
}
