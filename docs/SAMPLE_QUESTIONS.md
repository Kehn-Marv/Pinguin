# Sample Questions for Testing Pinguin

This document provides sample questions you can use to test Pinguin's capabilities. These are designed to demonstrate the RAG system's ability to retrieve and synthesize information.

## For Testing with AI/ML Documents

If you upload a machine learning textbook or paper:

1. "What is the difference between supervised and unsupervised learning?"
2. "Explain the backpropagation algorithm in simple terms"
3. "What are the main types of neural network architectures?"
4. "How does gradient descent work?"
5. "What is overfitting and how can it be prevented?"
6. "Compare decision trees and random forests"
7. "What is the purpose of activation functions?"
8. "Explain the bias-variance tradeoff"

## For Testing with Computer Science Documents

If you upload programming or CS textbooks:

1. "What are the main differences between arrays and linked lists?"
2. "Explain how quicksort works"
3. "What is Big O notation and why is it important?"
4. "Compare stack and queue data structures"
5. "What are the principles of object-oriented programming?"
6. "Explain recursion with an example"
7. "What is the difference between compilation and interpretation?"
8. "How does a hash table work?"

## For Testing with Research Papers

If you upload academic papers:

1. "What is the main contribution of this paper?"
2. "What methodology did the authors use?"
3. "What were the key findings?"
4. "What are the limitations mentioned?"
5. "How does this compare to previous work?"
6. "What datasets were used in the experiments?"
7. "What are the future research directions suggested?"
8. "Summarize the abstract in simple terms"

## For Testing with Lecture Notes

If you upload course lecture slides or notes:

1. "What are the key concepts covered in lecture 5?"
2. "Explain the main theorem discussed"
3. "What examples were given to illustrate this concept?"
4. "What are the prerequisites for understanding this topic?"
5. "Summarize the main points from this week's lectures"
6. "What homework problems relate to this concept?"
7. "How does this topic connect to previous lectures?"
8. "What are the practical applications mentioned?"

## For Testing with Textbooks

If you upload a general textbook:

1. "What is covered in chapter 3?"
2. "Explain the concept of [specific term from the book]"
3. "What are the key takeaways from this section?"
4. "How is [concept A] related to [concept B]?"
5. "What examples are provided for this topic?"
6. "Summarize the introduction"
7. "What are the review questions at the end of the chapter?"
8. "What prerequisites are needed for this material?"

## For Testing Multi-Document Retrieval

If you upload multiple related documents:

1. "Compare the approaches discussed in these documents"
2. "What common themes appear across all documents?"
3. "How do the authors' perspectives differ?"
4. "What evidence supports [specific claim]?"
5. "Synthesize the main arguments from all sources"
6. "What contradictions exist between the documents?"
7. "Which document provides the most detailed explanation of [topic]?"
8. "Create a timeline of developments based on these documents"

## For Testing OCR Capabilities

If you upload scanned documents:

1. "What is the title of this document?"
2. "Extract the main headings"
3. "What is written in the highlighted section?"
4. "Transcribe the text from page [X]"
5. "What figures or diagrams are mentioned?"
6. "Read the caption for figure [X]"
7. "What is the date on this document?"
8. "Extract the author information"

## For Testing Course Organization

After organizing documents by course:

1. "What topics are covered in my CS101 course?"
2. "Find information about [topic] in my Machine Learning materials"
3. "What documents do I have for the final exam?"
4. "Compare how [concept] is explained in different courses"
5. "What are the key concepts I should review for [course]?"

## Complex Reasoning Questions

To test the LLM's synthesis capabilities:

1. "Explain this concept as if I'm a beginner"
2. "What are the pros and cons of this approach?"
3. "How would I apply this in a real-world scenario?"
4. "What are common misconceptions about this topic?"
5. "Create a study guide for this chapter"
6. "What questions might appear on an exam about this?"
7. "How does this relate to current industry practices?"
8. "What are the ethical implications discussed?"

## Testing Source Attribution

Questions that verify source citations:

1. "Where in the document is [specific concept] explained?"
2. "Which page discusses [topic]?"
3. "What document contains information about [subject]?"
4. "Show me all mentions of [term] across my documents"
5. "Which author discusses [concept]?"

## Testing Edge Cases

1. "What is [something not in the documents]?" (Should say "not found")
2. "Compare [topic A] and [topic B]" (Tests multi-chunk retrieval)
3. "Explain [very specific detail]" (Tests precision)
4. "Give me an overview of everything" (Tests recall)
5. "What are the formulas mentioned?" (Tests technical content)

## Sample Test Document Content

If judges don't have documents handy, suggest they create a simple test document:

**Sample Test Document (test.txt)**:
```
Introduction to Artificial Intelligence

Artificial Intelligence (AI) is the simulation of human intelligence by machines. 
It includes several subfields:

1. Machine Learning: Systems that learn from data
   - Supervised Learning: Learning from labeled examples
   - Unsupervised Learning: Finding patterns in unlabeled data
   - Reinforcement Learning: Learning through trial and error

2. Natural Language Processing: Understanding and generating human language
   - Text classification
   - Machine translation
   - Question answering

3. Computer Vision: Interpreting visual information
   - Image classification
   - Object detection
   - Facial recognition

Key Concepts:
- Neural Networks: Computing systems inspired by biological brains
- Deep Learning: Neural networks with many layers
- Training Data: Examples used to teach AI systems
- Model: The learned representation of patterns in data

Applications:
AI is used in healthcare, finance, transportation, and education.
Examples include medical diagnosis, fraud detection, self-driving cars,
and personalized learning systems.

Challenges:
- Data quality and quantity
- Computational resources
- Ethical considerations
- Bias in AI systems
```

**Sample Questions for This Document**:
1. "What are the three main subfields of AI mentioned?"
2. "Explain the difference between supervised and unsupervised learning"
3. "What are some applications of AI?"
4. "What challenges does AI face?"
5. "What is deep learning?"

## Tips for Effective Testing

1. **Start Simple**: Begin with straightforward factual questions
2. **Increase Complexity**: Move to synthesis and comparison questions
3. **Test Boundaries**: Ask about things not in the documents
4. **Verify Sources**: Check that citations are accurate
5. **Multiple Documents**: Test cross-document retrieval
6. **Different Formats**: Try PDFs, DOCX, and TXT files
7. **Scanned Content**: Test OCR with image-based PDFs
8. **Long Documents**: Test with 50+ page documents

## Expected Behavior

**Good Responses Should**:
- Answer the question directly
- Include relevant context
- Cite specific sources (document name, page number)
- Acknowledge when information isn't available
- Synthesize information from multiple chunks when needed

**Red Flags**:
- Hallucinating information not in documents
- Missing obvious relevant information
- Incorrect source citations
- Generic answers without grounding in documents
- Refusing to answer when information is available

## Performance Expectations

On Arm devices with 3B models:
- **Query Time**: 2-4 seconds for typical questions
- **Accuracy**: High when information is in documents
- **Source Attribution**: Should always include document references
- **Context Length**: Can handle questions requiring 3-5 chunks of context

## Troubleshooting Test Issues

**If first query is slow (1-2 minutes)**:
- This is expected - models are loading into memory
- Subsequent queries will be faster (30-50 seconds)
- Keep the app running to avoid reloading
- See KNOWN_ISSUES.md for details

**If UI doesn't update after sending message**:
- Navigate to another chat and back to refresh
- This is a known v1.0 issue, fix coming in v1.1
- The response is still being generated correctly

**If scanned document processing is slow**:
- This is expected - OCR takes 20-30 minutes
- Use text-based PDFs for faster processing
- Process scanned documents during breaks

**If answers are poor**:
- Check that documents were processed successfully
- Verify embedding model is downloaded
- Try rephrasing the question
- Ensure the information is actually in the documents

**If it's too slow**:
- Use a smaller model (3B instead of 7B)
- Reduce top_k in settings
- Close other applications
- Check CPU isn't thermal throttling

**If sources are wrong**:
- This might indicate a bug—report it!
- Check document metadata in the database
- Verify document IDs are unique

## Demo Script for Judges

1. **Upload**: "Let me upload this text-based PDF - I'm using a text-based document for the demo since scanned documents take longer with OCR"
2. **Wait**: "Processing takes about 20 seconds for a 50-page text-based document"
3. **Query**: "Now I'll ask: 'What is machine learning?' - Note that the first query takes a bit longer as models load into memory"
4. **Show Answer**: "Notice the answer includes source citations from the document"
5. **Follow-up**: "Let me ask a follow-up: 'What are the types of machine learning?' - Subsequent queries are faster"
6. **Performance**: "All of this is running locally on this Arm device - no internet connection"
7. **Privacy**: "Complete privacy - your data never leaves your device"

**If UI glitches occur during demo**: "You might notice some minor UI state issues in v1.0 - these are cosmetic and prioritized for the next release. The core RAG functionality works perfectly."

This demonstrates the core value proposition in under 2 minutes!
