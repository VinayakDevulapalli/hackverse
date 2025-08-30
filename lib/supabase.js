// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper functions for bank statement operations
export const bankStatementOperations = {
  // Insert a new bank statement
  async insertStatement(statementData) {
    const { data, error } = await supabase
      .from('bank_statements')
      .insert(statementData)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  // Insert multiple transactions
  async insertTransactions(transactions) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(transactions)
      .select()
    
    if (error) throw error
    return data
  },

  // Get all statements for a user (if using auth)
  async getStatements(limit = 50) {
    const { data, error } = await supabase
      .from('bank_statements')
      .select(`
        *,
        transactions(count)
      `)
      .order('upload_date', { ascending: false })
      .limit(limit)
    
    if (error) throw error
    return data
  },

  // Get transactions for a specific statement
  async getStatementTransactions(statementId) {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('statement_id', statementId)
      .order('date', { ascending: false })
    
    if (error) throw error
    return data
  },

  // Get transactions by date range
  async getTransactionsByDateRange(startDate, endDate, bank = null) {
    let query = supabase
      .from('transactions')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
    
    if (bank) {
      query = query.eq('bank', bank)
    }
    
    const { data, error } = await query
    if (error) throw error
    return data
  },

  // Get spending by category
  async getSpendingByCategory(startDate = null, endDate = null) {
    let query = supabase
      .from('transactions')
      .select('category, amount')
      .lt('amount', 0) // Only expenses (negative amounts)
    
    if (startDate) query = query.gte('date', startDate)
    if (endDate) query = query.lte('date', endDate)
    
    const { data, error } = await query
    if (error) throw error
    
    // Group by category and sum amounts
    const categoryTotals = data.reduce((acc, transaction) => {
      const category = transaction.category || 'Uncategorized'
      acc[category] = (acc[category] || 0) + Math.abs(transaction.amount)
      return acc
    }, {})
    
    return Object.entries(categoryTotals).map(([category, total]) => ({
      category,
      total: Math.round(total * 100) / 100 // Round to 2 decimal places
    }))
  },

  // Delete a statement and its transactions
  async deleteStatement(statementId) {
    // Transactions will be automatically deleted due to CASCADE
    const { error } = await supabase
      .from('bank_statements')
      .delete()
      .eq('id', statementId)
    
    if (error) throw error
    return true
  },

  // Debug function to analyze transaction parsing
  async analyzeParsingIssues(categorizedText) {
    const lines = categorizedText.split('\n');
    const analysis = {
      totalLines: lines.length,
      nonEmptyLines: 0,
      linesWithDates: 0,
      linesWithAmounts: 0,
      sampleLines: []
    };

    const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/;
    const amountPattern = /([+-]?\$?\s*\d{1,3}(?:,\d{3})*\.?\d{0,2})/;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('=') || trimmed.includes('PAGE')) return;
      
      analysis.nonEmptyLines++;
      
      if (datePattern.test(trimmed)) analysis.linesWithDates++;
      if (amountPattern.test(trimmed)) analysis.linesWithAmounts++;
      
      // Collect first 5 sample lines for debugging
      if (analysis.sampleLines.length < 5) {
        analysis.sampleLines.push({
          lineNumber: index + 1,
          content: trimmed,
          hasDate: datePattern.test(trimmed),
          hasAmount: amountPattern.test(trimmed)
        });
      }
    });

    return analysis;
  }
}

// Real-time subscription helper
export const subscribeToStatements = (callback) => {
  return supabase
    .channel('bank_statements_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'bank_statements' },
      callback
    )
    .subscribe()
}

// Transaction subscription helper
export const subscribeToTransactions = (callback) => {
  return supabase
    .channel('transactions_changes')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'transactions' },
      callback
    )
    .subscribe()
}