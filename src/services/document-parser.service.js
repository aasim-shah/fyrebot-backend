import mammoth from 'mammoth';
import { createRequire } from 'module';
import pino from 'pino';

const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');

const logger = pino();

class DocumentParserService {
  /**
   * Supported file types
   */
  static SUPPORTED_TYPES = {
    'application/pdf': { ext: '.pdf', parser: 'pdf' },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: '.docx', parser: 'docx' },
    'application/msword': { ext: '.doc', parser: 'docx' },
    'text/plain': { ext: '.txt', parser: 'text' },
    'text/markdown': { ext: '.md', parser: 'text' },
  };

  static MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  /**
   * Validate file type and size
   */
  validateFile(mimetype, size, filename) {
    // Check file size
    if (size > DocumentParserService.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds limit of ${DocumentParserService.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Check file type
    const fileType = DocumentParserService.SUPPORTED_TYPES[mimetype];
    
    // Also check by extension if mimetype is generic
    if (!fileType && filename) {
      const ext = filename.toLowerCase().match(/\.(pdf|docx|doc|txt|md)$/)?.[1];
      if (ext) {
        const matchedType = Object.values(DocumentParserService.SUPPORTED_TYPES)
          .find(t => t.ext === `.${ext}`);
        if (matchedType) {
          return matchedType;
        }
      }
    }

    if (!fileType) {
      const supportedExts = Object.values(DocumentParserService.SUPPORTED_TYPES)
        .map(t => t.ext)
        .join(', ');
      throw new Error(`Unsupported file type. Supported formats: ${supportedExts}`);
    }

    return fileType;
  }

  /**
   * Parse PDF document
   */
  async parsePDF(buffer) {
    try {
      const data = await pdf(buffer);
      
      // Check if PDF has extractable text
      if (!data.text || data.text.trim().length === 0) {
        throw new Error('PDF appears to be image-based or has no selectable text. Please use PDFs with text layers or convert scanned documents to text-searchable PDFs.');
      }
      
      return {
        text: data.text,
        pages: data.numpages,
        metadata: {
          info: data.info,
          metadata: data.metadata,
          pages: data.numpages
        }
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to parse PDF');
      
      // Provide more specific error messages
      if (error.message.includes('image-based') || error.message.includes('no selectable text')) {
        throw error;
      }
      
      if (error.message.includes('password') || error.message.includes('encrypted')) {
        throw new Error('PDF is password-protected or encrypted. Please upload an unprotected PDF.');
      }
      
      if (error.message.includes('Invalid PDF structure') || error.message.includes('corrupted')) {
        throw new Error('PDF file appears to be corrupted or has an invalid structure. Please try re-saving or re-exporting the PDF.');
      }
      
      // Generic PDF parsing error with more context
      throw new Error(`Unable to extract text from PDF. This could be because: (1) The PDF is image-based/scanned without OCR, (2) The PDF is protected/encrypted, (3) The PDF has an unsupported format. Error details: ${error.message}`);
    }
  }

  /**
   * Parse DOCX document
   */
  async parseDOCX(buffer) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return {
        text: result.value,
        warnings: result.messages
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to parse DOCX');
      throw new Error('Failed to parse DOCX document');
    }
  }

  /**
   * Parse plain text document
   */
  async parseText(buffer) {
    try {
      const text = buffer.toString('utf-8');
      return {
        text,
        lines: text.split('\n').length
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to parse text');
      throw new Error('Failed to parse text document');
    }
  }

  /**
   * Main parse method - routes to appropriate parser
   */
  async parseDocument(buffer, mimetype, filename) {
    const fileType = this.validateFile(mimetype, buffer.length, filename);
    
    logger.info({ 
      filename, 
      mimetype, 
      size: buffer.length,
      parser: fileType.parser 
    }, 'Parsing document');

    let result;

    try {
      switch (fileType.parser) {
        case 'pdf':
          result = await this.parsePDF(buffer);
          break;
        case 'docx':
          result = await this.parseDOCX(buffer);
          break;
        case 'text':
          result = await this.parseText(buffer);
          break;
        default:
          throw new Error('Unsupported parser type');
      }

      // Clean up the text
      const cleanedText = this.cleanText(result.text);

      // Validate content after cleaning
      this.validateContent(cleanedText, filename);

      return {
        content: cleanedText,
        originalLength: result.text.length,
        cleanedLength: cleanedText.length,
        metadata: {
          ...result.metadata,
          parser: fileType.parser,
          filename,
          mimetype
        }
      };
    } catch (error) {
      // Provide more helpful error messages
      if (error.message.includes('no extractable text') || error.message.includes('insufficient content')) {
        throw error;
      }
      
      logger.error({ error: error.message, filename }, 'Document parsing failed');
      throw new Error(`Failed to parse "${filename}": ${error.message}`);
    }
  }

  /**
   * Clean and normalize extracted text
   */
  cleanText(text) {
    if (!text) return '';

    return text
      // Remove multiple spaces
      .replace(/  +/g, ' ')
      // Remove multiple newlines (keep max 2)
      .replace(/\n{3,}/g, '\n\n')
      // Remove leading/trailing whitespace from each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Remove leading/trailing whitespace
      .trim();
  }

  /**
   * Validate extracted content
   */
  validateContent(content, filename) {
    if (!content || content.trim().length === 0) {
      throw new Error(`File "${filename}" contains no extractable text. Please ensure the file has readable content.`);
    }

    // Check minimum content length (at least 10 characters)
    if (content.trim().length < 10) {
      throw new Error(`File "${filename}" has insufficient content (less than 10 characters). Please provide files with more substantial content.`);
    }

    return true;
  }

  /**
   * Get file type info
   */
  static getSupportedFormats() {
    return Object.entries(DocumentParserService.SUPPORTED_TYPES).map(([mime, info]) => ({
      mimetype: mime,
      extension: info.ext,
      parser: info.parser
    }));
  }
}

export default new DocumentParserService();
