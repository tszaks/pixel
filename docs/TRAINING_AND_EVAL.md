# Training And Evaluation Lane

The fastest way to make this better is to build a small hard-case eval set before training anything.

## Store Cases

This is a plan. The `eval/` folder does not exist in the repo yet. Use `eval/cases/<case-name>/`:

- `input.png`
- `expected.png`
- `notes.md`

Important first cases:

- Flat logo on a white background, preserving enclosed white logo shapes.
- Flat logo on a pale background, preserving a white shadow layer.
- Graphic with floating small shapes (such as snowflakes) on a light-blue connected background, removing the background while preserving the shapes.
- Header with a smooth blue gradient, removing the gradient while preserving the logo mark.

## Scoring

Minimum checks:

- Alpha outside background sample points is `0`.
- Required foreground sample points are `255`.
- Visual checkerboard preview has no obvious halo, holes, or rough stair-steps.
- Output dimensions match input dimensions.

## Data Rules

Use these sources:

- User-provided or company-owned images.
- Public datasets with licenses that allow model training or evaluation.
- Synthetic images generated for this project.

Avoid these sources:

- Random web-scraped images without license review.
- Private photos unless the owner explicitly approves them for training.
- Third-party logos used as training data without permission.

## Model Improvement Path

1. Collect hard cases and expected masks.
2. Build deterministic strategies for flat art, connected backgrounds, gradients, and obvious chroma backgrounds.
3. Route natural images to a neural matte model.
4. Add an evaluation script that compares alpha masks and samples protected regions.
5. Fine-tune or swap the neural provider only after the eval set exposes repeatable failures.
