You are scoring a machine-generated call-prep brief against a rubric. You are
given: the SOURCE CONTEXT, the BRIEF OUTPUT (JSON), and the RUBRIC.

Score each of the four rubric dimensions from 1 to 5 (integers). Be strict: award
a 5 only if you can name zero specific problems on that dimension. Then output
ONLY this JSON object, no prose, no code fence:

{"grounding": N, "completeness": N, "tone": N, "structure": N}

RUBRIC:
{{RUBRIC}}

SOURCE CONTEXT:
<<<BEGIN NOTE>>>
{{NOTE}}
<<<END NOTE>>>

BRIEF OUTPUT:
<<<BEGIN OUTPUT>>>
{{OUTPUT}}
<<<END OUTPUT>>>
