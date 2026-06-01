# Training And Evaluation Lane

The fastest way to make this better is to build a small hard-case eval set before training anything.

## Store Cases

Use `eval/cases/<case-name>/`:

- `input.png`
- `expected.png`
- `notes.md`

Important first cases:

- Vero money logo on white background, preserving enclosed white logo shapes.
- Vero alternate money logo on pale background, preserving white shadow layer.
- Snow countdown graphic, removing light-blue connected background while preserving floating snowflakes.
- GNA gradient header, removing smooth blue gradient while preserving the blue logo mark.

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
- Private photos unless Tyler explicitly approves them for training.
- Third-party logos used as training data without permission.

## Model Improvement Path

1. Collect hard cases and expected masks.
2. Build deterministic strategies for flat art, connected backgrounds, gradients, and obvious chroma backgrounds.
3. Route natural images to a neural matte model.
4. Add an evaluation script that compares alpha masks and samples protected regions.
5. Fine-tune or swap the neural provider only after the eval set exposes repeatable failures.
