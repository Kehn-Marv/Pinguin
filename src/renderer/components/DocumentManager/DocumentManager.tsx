import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Chip,
  Alert,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import InfoIcon from "@mui/icons-material/Info";
import { useDocuments } from "../../hooks/useDocuments";
import { useParams } from "react-router-dom";
import useScrollbarStyle from "../../UI/useScrollbarStyle";

interface DocumentDetailsDialogProps {
  document: Doc | null;
  open: boolean;
  onClose: () => void;
}

const DocumentDetailsDialog: React.FC<DocumentDetailsDialogProps> = ({
  document,
  open,
  onClose,
}) => {
  if (!document) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Document Details</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              File Name
            </Typography>
            <Typography variant="body1">{document.title}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              File Type
            </Typography>
            <Typography variant="body1">{document.docType.toUpperCase()}</Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              File Path
            </Typography>
            <Typography variant="body2" sx={{ wordBreak: "break-all" }}>
              {document.path}
            </Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

interface DeleteConfirmDialogProps {
  document: Doc | null;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  document,
  open,
  onClose,
  onConfirm,
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete Document</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete "{document?.title}"? This action cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onConfirm} color="error" variant="contained">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const DocumentManager: React.FC = () => {
  const scrollbarStyle = useScrollbarStyle();
  const { courseId } = useParams();
  const { documents, isLoading, error, uploadDocument, deleteDocument } = useDocuments(courseId || "");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<Doc | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Doc | null>(null);

  const handleUpload = async () => {
    if (courseId) {
      await uploadDocument(courseId);
    }
  };

  const handleDeleteClick = (doc: Doc) => {
    setDocumentToDelete(doc);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (documentToDelete) {
      await deleteDocument(documentToDelete.id);
      setDeleteDialogOpen(false);
      setDocumentToDelete(null);
    }
  };

  const handleDetailsClick = (doc: Doc) => {
    setSelectedDocument(doc);
    setDetailsDialogOpen(true);
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getFileTypeColor = (type: DocType): "default" | "primary" | "secondary" | "success" => {
    switch (type) {
      case "pdf":
        return "error" as "default";
      case "docx":
        return "primary";
      case "pptx":
        return "secondary";
      default:
        return "default";
    }
  };

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "1400px",
        margin: "0 auto",
        p: 3,
      }}
    >
      {/* Header */}
      <Box sx={{ mb: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h5" fontWeight="bold">
          Document Library
        </Typography>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          onClick={handleUpload}
          disabled={isLoading}
        >
          Upload Document
        </Button>
      </Box>

      {/* Search Bar */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search documents..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon />
            </InputAdornment>
          ),
        }}
      />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading Progress */}
      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Documents Table */}
      <TableContainer
        component={Paper}
        sx={{
          flex: 1,
          overflowY: "auto",
          ...scrollbarStyle,
        }}
      >
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>File Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Course</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDocuments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  <Box sx={{ py: 4 }}>
                    <UploadFileIcon sx={{ fontSize: 48, opacity: 0.3, mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      {searchQuery
                        ? "No documents match your search"
                        : "No documents uploaded yet"}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              filteredDocuments.map((doc) => (
                <TableRow key={doc.id} hover>
                  <TableCell>
                    <Typography variant="body2">{doc.title}</Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={doc.docType.toUpperCase()}
                      size="small"
                      color={getFileTypeColor(doc.docType)}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {doc.courseId}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleDetailsClick(doc)}
                      title="View Details"
                    >
                      <InfoIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(doc)}
                      title="Delete"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Document Count */}
      <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="body2" color="text.secondary">
          {filteredDocuments.length} document{filteredDocuments.length !== 1 ? "s" : ""}
          {searchQuery && ` (filtered from ${documents.length})`}
        </Typography>
      </Box>

      {/* Dialogs */}
      <DocumentDetailsDialog
        document={selectedDocument}
        open={detailsDialogOpen}
        onClose={() => setDetailsDialogOpen(false)}
      />
      <DeleteConfirmDialog
        document={documentToDelete}
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
      />
    </Box>
  );
};

export default DocumentManager;
